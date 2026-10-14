import axios from 'axios';
import {logoutSession} from './logoutSession';
jest.mock('axios', () => ({__esModule: true, default: {post: jest.fn()}}));

test('clears login state only after the server confirms logout', async () => {
    let finish;
    axios.post.mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
    const clear = jest.fn();
    const pending = logoutSession(clear);
    expect(axios.post).toHaveBeenCalledWith('/api/logout');
    expect(clear).not.toHaveBeenCalled();
    finish({status: 200});
    await pending;
    expect(clear).toHaveBeenCalledTimes(1);
});

test('failed logout preserves login state', async () => {
    axios.post.mockRejectedValueOnce(new Error('network failure'));
    const clear = jest.fn();
    await expect(logoutSession(clear)).rejects.toThrow('network failure');
    expect(clear).not.toHaveBeenCalled();
});
