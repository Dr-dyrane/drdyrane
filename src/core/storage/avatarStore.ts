const AVATAR_PREFIX = 'dr_dyrane.v1.avatar';
const LOCAL_AVATAR_SCHEME = 'local-avatar://';
export const MAX_AVATAR_FILE_BYTES = 6 * 1024 * 1024;
const GENERATED_AVATAR_BASE_URL = 'https://api.dicebear.com/9.x/fun-emoji/svg';

const getAvatarKey = (profileId: string): string => `${AVATAR_PREFIX}.${profileId}`;

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process image.'));
    image.src = source;
  });

const compressImage = async (file: File, maxEdge: number = 512): Promise<string> => {
  const rawDataUrl = await fileToDataUrl(file);
  const image = await loadImage(rawDataUrl);
  const longest = Math.max(image.width, image.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    return rawDataUrl;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
};

const getProfileIdFromUri = (uri: string): string | null => {
  if (!uri.startsWith(LOCAL_AVATAR_SCHEME)) return null;
  const raw = uri.slice(LOCAL_AVATAR_SCHEME.length);
  if (!raw) return null;
  return raw.split('?')[0] || null;
};

export const isLocalAvatarUri = (uri: string): boolean => uri.startsWith(LOCAL_AVATAR_SCHEME);

export const saveProfileAvatar = async (profileId: string, file: File): Promise<string> => {
  const compressed = await compressImage(file);
  localStorage.setItem(getAvatarKey(profileId), compressed);
  return `${LOCAL_AVATAR_SCHEME}${profileId}?v=${Date.now()}`;
};

export const saveProfileAvatarData = (profileId: string, dataUrl: string): string => {
  localStorage.setItem(getAvatarKey(profileId), dataUrl);
  return `${LOCAL_AVATAR_SCHEME}${profileId}?v=${Date.now()}`;
};

export const removeProfileAvatar = (profileId: string): void => {
  localStorage.removeItem(getAvatarKey(profileId));
};

export const resolveProfileAvatarUrl = (avatarUri: string): string => {
  if (!avatarUri) return '';
  if (!isLocalAvatarUri(avatarUri)) return avatarUri;

  const profileId = getProfileIdFromUri(avatarUri);
  if (!profileId) return '';

  return localStorage.getItem(getAvatarKey(profileId)) || '';
};

const sanitizeAvatarSeed = (seed: string): string => {
  const normalized = (seed || '').trim().replace(/\s+/g, ' ');
  return normalized || 'Patient';
};

export const buildGeneratedAvatarUrl = (seed: string): string => {
  const safeSeed = sanitizeAvatarSeed(seed);
  const params = new URLSearchParams({
    seed: safeSeed,
    radius: '50',
    backgroundType: 'gradientLinear',
  });
  return `${GENERATED_AVATAR_BASE_URL}?${params.toString()}`;
};

export const resolveProfileAvatarWithFallback = (
  avatarUri: string,
  seed: string = 'Patient'
): string => {
  const resolved = resolveProfileAvatarUrl(avatarUri);
  if (resolved) return resolved;
  return buildGeneratedAvatarUrl(seed);
};
