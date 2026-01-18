import 'dotenv/config';
console.log('cwd', process.cwd());
console.log('id?', !!process.env.PLAID_CLIENT_ID);
console.log('secret?', !!process.env.PLAID_SECRET);
console.log('env', process.env.PLAID_ENV);
