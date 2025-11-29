import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { updateOrganizerTrustScore } from '@/lib/trustScore';

const DEFAULT_SAMPLE_LIMIT = 25;
const HIKING_KEYWORDS = [
  'hike',
  'hiking',
  'trek',
  'trekking',
  'trail',
  'summit',
  'peak',
  'mt.',
  'mt ',
  'mount ',
  'mountain',
  'ridge',
  'ascent',
  'descent',
  'campsite',
  'camp',
  'dayhike',
  'overnight',
  'basecamp',
  'trailhead',
  'summit push',
  'altitude',
  'elevation',
  'km',
  'meters',
  'mt. apo',
  'apo',
  'pulag',
  'apo',
];

function sanitizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function mapVerification(record) {
  if (!record) return null;
  return {
    ...record,
    failureReasons: Array.isArray(record.failureReasons)
      ? record.failureReasons
      : record.failureReasons
        ? [String(record.failureReasons)]
        : [],
    postSample: record.postSample ?? [],
  };
}

function classifyPosts(posts) {
  if (!Array.isArray(posts)) return { ratio: 0, hikingCount: 0, total: 0, sample: [] };

  let hikingCount = 0;
  const sample = [];

  posts.forEach((post) => {
    const message = typeof post.message === 'string' ? post.message : '';
    const lower = message.toLowerCase();
    const isHiking = HIKING_KEYWORDS.some((keyword) => lower.includes(keyword));
    if (isHiking) {
      hikingCount += 1;
    }
    sample.push({
      id: post.id ?? null,
      message: message.slice(0, 280),
      created_time: post.created_time ?? null,
      permalink_url: post.permalink_url ?? null,
      hiking: isHiking,
    });
  });

  const total = posts.length;
  const ratio = total > 0 ? hikingCount / total : 0;
  return { ratio, hikingCount, total, sample: sample.slice(0, DEFAULT_SAMPLE_LIMIT) };
}

function scoreFacebookContent({ ratio, totalPosts, engagementAverage }) {
  // Hiking content score 0–20
  let score = 0;
  if (ratio >= 0.8) {
    score = 20;
  } else if (ratio >= 0.4) {
    score = Math.round(10 + (ratio - 0.4) * (10 / 0.4)); // 10–20
  } else {
    score = Math.round(Math.max(0, ratio * 25)); // up to ~10
  }

  // Engagement 0–10 (optional)
  let engagementScore = 0;
  if (Number.isFinite(engagementAverage)) {
    if (engagementAverage >= 200) engagementScore = 10;
    else if (engagementAverage >= 100) engagementScore = 8;
    else if (engagementAverage >= 50) engagementScore = 6;
    else if (engagementAverage >= 20) engagementScore = 4;
    else if (engagementAverage >= 5) engagementScore = 2;
  }

  let status = 'FAILED';
  if (ratio >= 0.8) status = 'VERIFIED';
  else if (ratio >= 0.4) status = 'PARTIAL';

  const failureReasons = [];
  if (totalPosts < 5) {
    failureReasons.push('Not enough recent posts to evaluate activity.');
  }
  if (ratio < 0.4) {
    failureReasons.push('Less than 40% of recent posts mention hiking.');
  }

  return { score, engagementScore, status, failureReasons };
}

async function fetchFacebookPosts({ pageId, pageAccessToken, limit = 50 }) {
  if (!pageId || !pageAccessToken) {
    return [];
  }
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
    pageId,
  )}/posts?fields=message,created_time,permalink_url,shares,comments.summary(true),likes.summary(true)&limit=${limit}&access_token=${encodeURIComponent(
    pageAccessToken,
  )}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Facebook API error: ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json?.data) ? json.data : [];
}

function normalizePosts(rawPosts) {
  if (!Array.isArray(rawPosts)) return [];
  return rawPosts
    .map((post) => {
      if (!post) return null;
      return {
        id: post.id ?? null,
        message: typeof post.message === 'string' ? post.message : '',
        created_time: post.created_time ?? null,
        permalink_url: post.permalink_url ?? null,
        likes: Number(post?.likes?.summary?.total_count) || 0,
        comments: Number(post?.comments?.summary?.total_count) || 0,
        shares: Number(post?.shares?.count) || 0,
      };
    })
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const verification = await prisma.facebookVerification.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({ verification: mapVerification(verification) });
  } catch (error) {
    console.error('GET /api/users/facebook-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

// POST handles linking and refreshing analysis. If posts are provided in the payload, we use them;
// otherwise attempt to call the Graph API with a provided access token.
export async function POST(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const pageId = sanitizeString(body?.pageId);
    const pageName = sanitizeString(body?.pageName);
    const pageUrl = sanitizeString(body?.pageUrl);
    const providedPosts = normalizePosts(body?.posts);
    const pageAccessToken = sanitizeString(
      body?.pageAccessToken ?? process.env.FB_PAGE_ACCESS_TOKEN ?? '',
    );

    if (!pageId && providedPosts.length === 0) {
      return NextResponse.json(
        { message: 'Provide a Facebook pageId or post samples to analyze.' },
        { status: 400 },
      );
    }

    let posts = providedPosts;
    if (posts.length === 0 && pageId && pageAccessToken) {
      try {
        const fetched = await fetchFacebookPosts({ pageId, pageAccessToken });
        posts = normalizePosts(fetched);
      } catch (error) {
        console.error('Facebook fetch failed:', error);
        return NextResponse.json(
          { message: 'Failed to fetch posts from Facebook. Check access token or permissions.' },
          { status: 502 },
        );
      }
    }

    const { ratio, total, sample } = classifyPosts(posts);
    const engagementAverage =
      posts.length > 0
        ? posts.reduce((sum, p) => sum + (p.likes + p.comments + p.shares), 0) / posts.length
        : 0;
    const scoring = scoreFacebookContent({
      ratio,
      totalPosts: total,
      engagementAverage,
    });

    const data = {
      pageId,
      pageName,
      pageUrl,
      status: scoring.status,
      score: scoring.score,
      engagementScore: scoring.engagementScore,
      hikingRatio: ratio,
      postSample: sample,
      failureReasons: scoring.failureReasons,
      lastCheckedAt: new Date(),
    };

    const record = await prisma.facebookVerification.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    const trust = await updateOrganizerTrustScore(user.id);

    return NextResponse.json({
      message: 'Facebook page analyzed.',
      verification: mapVerification(record),
      trust,
    });
  } catch (error) {
    console.error('POST /api/users/facebook-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
