const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const {logoutSession} = require('../logout-session');

test('logout invalidates the session even when the old cookie is reused on refresh', async () => {
    const app = express();
    app.use(session({secret: 'test-only-session-secret', resave: false, saveUninitialized: false}));
    app.post('/test-login', (req,res) => {req.session.user = {id:'test-user'};res.json({ok:true});});
    app.post('/api/logout', logoutSession);
    app.get('/api/current_user', (req,res) => res.status(req.session.user ? 200 : 401).json({user:req.session.user}));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
        const login = await fetch(url+'/test-login', {method:'POST'});
        const cookie = login.headers.get('set-cookie').split(';')[0];
        assert.equal((await fetch(url+'/api/current_user', {headers:{cookie}})).status,200);
        const logout = await fetch(url+'/api/logout', {method:'POST',headers:{cookie}});
        assert.equal(logout.status,200);
        assert.match(logout.headers.get('set-cookie'),/connect.sid=;/);
        assert.equal(logout.headers.get('cache-control'),'no-store');
        assert.equal((await fetch(url+'/api/current_user', {headers:{cookie}})).status,401);
    } finally {await new Promise(resolve => server.close(resolve));}
});

test('session-store failure reports an error without claiming logout succeeded', () => {
    let status, body, cleared=false;
    logoutSession({session:{destroy:callback=>callback(new Error('store unavailable'))}}, {
        set(){}, status(code){status=code;return this;},json(value){body=value;},clearCookie(){cleared=true;}
    });
    assert.equal(status,500);assert.equal(cleared,false);assert.equal(body.message,'Failed to log out');
});
