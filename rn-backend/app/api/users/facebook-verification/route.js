import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { updateOrganizerTrustScore } from '@/lib/trustScore';

const DEFAULT_SAMPLE_LIMIT = 25;
const HIKING_KEYWORDS = [
  'hike',
  'hiking',
  'hikes',
  'hiker',
  'hikers',
  'hikingph',
  'hikeph',
  'trek',
  'trekker',
  'trekkers',
  'trekking',
  'climb',
  'climbing',
  'ascend',
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
];

function sanitizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function extractPageIdentifier(pageId, pageUrl) {
  if (pageId) return pageId;
  if (!pageUrl) return null;

  const normalized = pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`;
  try {
    const url = new URL(normalized);
    const queryId = url.searchParams.get('id');
    if (queryId) return queryId;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;

    if (segments[0].toLowerCase() === 'pages') {
      if (segments[2]) return segments[2];
      if (segments[1]) return segments[1];
    }

    if (segments[0].toLowerCase() === 'groups' && segments[1]) {
      return segments[1];
    }

    return segments[0];
  } catch {
    const stripped = pageUrl.replace(/^https?:\/\//i, '').split('/')[0];
    return stripped || null;
  }
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
    const textContent =
      typeof post.textContent === 'string' && post.textContent.trim()
        ? post.textContent
        : message;
    const lower = textContent.toLowerCase();
    const isHiking = HIKING_KEYWORDS.some((keyword) => lower.includes(keyword));
    if (isHiking) {
      hikingCount += 1;
    }
    sample.push({
      id: post.id ?? null,
      message: textContent.slice(0, 280),
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
  )}/posts?fields=message,story,created_time,permalink_url,shares,comments.summary(true),likes.summary(true),reactions.summary(true),attachments{description,title,name}&limit=${limit}&access_token=${encodeURIComponent(
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

  const attachmentText = (attachments) => {
    if (!attachments?.data || !Array.isArray(attachments.data)) return '';
    return attachments.data
      .map((item) => {
        const pieces = [];
        ['title', 'name', 'description'].forEach((field) => {
          const value = item?.[field];
          if (typeof value === 'string' && value.trim()) {
            pieces.push(value.trim());
          }
        });
        return pieces.join(' ');
      })
      .filter(Boolean)
      .join(' ');
  };

  return rawPosts
    .map((post) => {
      if (!post) return null;
      const message = typeof post.message === 'string' ? post.message : '';
      const story = typeof post.story === 'string' ? post.story : '';
      const mediaText = attachmentText(post.attachments);
      const textContent = [message, story, mediaText]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(' ');

      return {
        id: post.id ?? null,
        message,
        textContent,
        created_time: post.created_time ?? null,
        permalink_url: post.permalink_url ?? null,
        likes: Number(
          post?.likes?.summary?.total_count ?? post?.reactions?.summary?.total_count,
        ) || 0,
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

    const resolvedPageId = extractPageIdentifier(pageId, pageUrl);

    if (!resolvedPageId && providedPosts.length === 0) {
      return NextResponse.json(
        { message: 'Provide a Facebook page URL/ID or post samples to analyze.' },
        { status: 400 },
      );
    }

    let posts = providedPosts;
    if (posts.length === 0 && resolvedPageId && pageAccessToken) {
      try {
        const fetched = await fetchFacebookPosts({ pageId: resolvedPageId, pageAccessToken });
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
      pageId: resolvedPageId,
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
