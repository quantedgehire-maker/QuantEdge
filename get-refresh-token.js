const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = '655720577641-82a7msi26jcql8in9f565lbk4hn2kmsu.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000'; // for desktop app

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // forces refresh token
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error getting tokens', err);
    console.log('Refresh Token:', token.refresh_token);
    console.log('\nAdd these to your .env file:');
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}`);
  });
});