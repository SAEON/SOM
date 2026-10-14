import axios from 'axios';

export async function logoutSession(onLoggedOut) {
    await axios.post('/api/logout');
    onLoggedOut();
}
