import { describe, it, expect } from 'vitest';

import { isRemoteRepo } from '../src/plugin/default-installers.js';

describe('default-installers: isRemoteRepo', () => {
  it('returns true for https URLs', () => {
    expect(isRemoteRepo('https://github.com/s12ryt/s12ryt-base-plugins')).toBe(true);
  });

  it('returns true for http URLs', () => {
    expect(isRemoteRepo('http://example.com/repo.git')).toBe(true);
  });

  it('returns true for git@ SSH URLs', () => {
    expect(isRemoteRepo('git@github.com:s12ryt/s12ryt-base-plugins.git')).toBe(true);
  });

  it('returns false for absolute local paths', () => {
    expect(isRemoteRepo('F:\\Project\\base\\s12ryt-base-plugins')).toBe(false);
    expect(isRemoteRepo('/home/user/repos/plugins')).toBe(false);
  });

  it('returns false for relative local paths', () => {
    expect(isRemoteRepo('../s12ryt-base-plugins')).toBe(false);
    expect(isRemoteRepo('./plugins')).toBe(false);
  });
});
