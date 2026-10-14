function logoutSession(req, res) {
    res.set('Cache-Control', 'no-store');
    req.session.destroy(error => {
        if (error) return res.status(500).json({message: 'Failed to log out'});
        res.clearCookie('connect.sid', {path: '/'});
        res.status(200).json({message: 'Logged out successfully'});
    });
}
module.exports = {logoutSession};
