import { useState, useEffect } from 'react';

const REPO = 'BenjaminDuo/MedScience';

/** Where to send someone when we cannot name an exact file for them. */
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

/** The downloads the installation page offers, in the order it shows them. */
export type AssetKind =
  | 'mac-arm64'
  | 'mac-x64'
  | 'win-setup'
  | 'win-portable'
  | 'linux-appimage'
  | 'linux-deb';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/**
 * Matchers against the filenames electron-builder produces (see
 * packages/desktop/electron-builder.json, where appImage/deb pin theirs).
 * Matching the published assets beats rebuilding the filenames ourselves:
 * a renamed artifact degrades to the releases page instead of a dead link.
 */
const MATCHERS: Record<AssetKind, RegExp> = {
  'mac-arm64': /-arm64\.dmg$/i,
  'mac-x64': /^(?!.*arm64).*\.dmg$/i,
  'win-setup': /\.exe$/i,
  'win-portable': /-win\.zip$/i,
  'linux-appimage': /\.AppImage$/i,
  'linux-deb': /\.deb$/i,
};

export interface LatestRelease {
  /** 'v2.0.0' once known, otherwise undefined -- never a guess. */
  tag?: string;
  /** The tag without its leading 'v', for prose like "Download (2.0.0)". */
  version?: string;
  /**
   * The direct download for one asset, or undefined when the release has no
   * such file (or has not been published yet). Callers fall back to
   * RELEASES_PAGE so a button is never a 404.
   */
  urlFor: (kind: AssetKind) => string | undefined;
  /** True once a request has settled, either way. */
  settled: boolean;
}

/**
 * Reads the repository's latest GitHub release and hands back real asset URLs.
 *
 * The download links used to be written out by hand, with the version spelled
 * into each one. Every release left some of them pointing at the previous
 * one -- the page offered v1.1.0 builds long after v1.4.0 shipped -- and a
 * version bumped here before the tag was pushed made every link a 404 until
 * the release went out. Asking GitHub removes both failure modes: the page
 * follows whatever is actually published, and nothing needs editing at
 * release time.
 *
 * On a rate limit or a network failure this resolves to no assets rather than
 * inventing URLs, and the UI sends people to the releases page instead.
 */
export function useLatestRelease(): LatestRelease {
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((res) => {
        if (!res.ok) throw new Error('Rate limited, or no release published yet');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (typeof data?.tag_name === 'string') setTag(data.tag_name);
        if (Array.isArray(data?.assets)) {
          setAssets(
            data.assets.filter(
              (a: unknown): a is ReleaseAsset =>
                typeof (a as ReleaseAsset)?.name === 'string' &&
                typeof (a as ReleaseAsset)?.browser_download_url === 'string'
            )
          );
        }
      })
      .catch(() => {
        // Leave assets empty: callers fall back to the releases page.
      })
      .finally(() => {
        if (isMounted) setSettled(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    tag,
    version: tag?.replace(/^v/, ''),
    settled,
    urlFor: (kind) => assets.find((a) => MATCHERS[kind].test(a.name))?.browser_download_url,
  };
}
