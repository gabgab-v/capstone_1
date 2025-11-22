export const POST_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  FRIENDS: 'FRIENDS',
  PRIVATE: 'PRIVATE',
};

export const POST_VISIBILITY_OPTIONS = [
  {
    value: POST_VISIBILITY.PUBLIC,
    label: 'Everyone',
    description: 'Visible to all explorers on Pabukid.',
    icon: 'globe',
  },
  {
    value: POST_VISIBILITY.FRIENDS,
    label: 'Friends',
    description: 'Only people you follow who follow you back.',
    icon: 'users',
  },
  {
    value: POST_VISIBILITY.PRIVATE,
    label: 'Only me',
    description: 'Keep this adventure just for yourself.',
    icon: 'lock',
  },
];

export function getPostVisibilityOption(value) {
  return POST_VISIBILITY_OPTIONS.find((option) => option.value === value) ?? POST_VISIBILITY_OPTIONS[0];
}
