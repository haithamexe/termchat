import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Force the store to use a temporary test file
const TEST_DATA_FILE = resolve("data/store_test.json");
process.env.TERMCHAT_DATA = TEST_DATA_FILE;

import { store } from './db.js';

describe('Database Store', () => {
  beforeEach(() => {
    // Clean up any existing test data before each run
    try {
      rmSync(TEST_DATA_FILE, { force: true });
    } catch {}
    // Reset store data manually for isolation since it's a singleton
    (store as any).data = { users: [], channels: [], messages: [], friendRequests: [] };
  });

  afterEach(() => {
    try {
      rmSync(TEST_DATA_FILE, { force: true });
    } catch {}
  });

  it('should create users', () => {
    const user = store.createUser('alice', 'hash');
    expect(user.username).toBe('alice');
    expect(user.friends).toEqual([]);
    
    const found = store.findUserByName('Alice');
    expect(found).toBeDefined();
    expect(found?.id).toBe(user.id);
  });

  it('should handle friends and requests', () => {
    store.createUser('alice', 'hash');
    store.createUser('bob', 'hash');

    const req = store.createFriendRequest('alice', 'bob');
    expect(req).toBeDefined();
    expect(req?.status).toBe('pending');
    
    const requests = store.getFriendRequestsFor('bob');
    expect(requests.length).toBe(1);

    const success = store.acceptFriendRequest(req!.id, 'bob');
    expect(success).toBe(true);

    const aliceFriends = store.getFriendsFor('alice');
    expect(aliceFriends.length).toBe(1);
    expect(aliceFriends[0].username).toBe('bob');
  });

  it('should handle message editing and deletion', () => {
    const user = store.createUser('charlie', 'hash');
    
    store.addMessage({
      id: 'msg1',
      channel: 'general',
      userId: user.id,
      username: user.username,
      text: 'hello world',
      ts: Date.now()
    });

    const edited = store.editMessage('msg1', user.id, 'hello edited');
    expect(edited).toBeDefined();
    expect(edited?.text).toBe('hello edited');
    expect(edited?.isEdited).toBe(true);

    const deleted = store.deleteMessage('msg1', user.id);
    expect(deleted).toBeDefined();
    expect(deleted?.text).toBe('[Message deleted]');
    expect(deleted?.isDeleted).toBe(true);
    
    // Should not allow editing a deleted message
    const tryEditAgain = store.editMessage('msg1', user.id, 'nope');
    expect(tryEditAgain).toBeUndefined();
  });

  it('should handle reactions', () => {
    const user1 = store.createUser('dave', 'hash');
    const user2 = store.createUser('eve', 'hash');

    store.addMessage({
      id: 'msg2',
      channel: 'general',
      userId: user1.id,
      username: user1.username,
      text: 'react to me',
      ts: Date.now()
    });

    // Add reaction
    const reacted = store.toggleReaction('msg2', user2.username, '🔥');
    expect(reacted?.reactions).toBeDefined();
    expect(reacted?.reactions!['🔥']).toContain('eve');

    // Toggle off
    const toggledOff = store.toggleReaction('msg2', user2.username, '🔥');
    expect(toggledOff?.reactions!['🔥']).toBeUndefined();
  });
});
