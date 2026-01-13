const dns = require('dns');
const hostname = 'cluster0.bfb2nq7.mongodb.net';

dns.resolveSrv('_mongodb._tcp.' + hostname, (err, addresses) => {
    if (err) {
        console.error('SRV lookup error:', err);
    } else {
        console.log('SRV addresses:', addresses);
    }
});

dns.lookup(hostname, (err, address, family) => {
    if (err) {
        console.error('Standard lookup error:', err);
    } else {
        console.log('Standard lookup address:', address);
    }
});
