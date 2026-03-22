const { compileFunc } = require('@ton-community/func-js');
const fs = require('fs');
const https = require('https');
const path = require('path');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync('build', { recursive: true });
  fs.mkdirSync('contracts/imports', { recursive: true });

  // Download stdlib
  console.log('Downloading stdlib.fc...');
  await download(
    'https://raw.githubusercontent.com/ton-blockchain/ton/master/crypto/smartcont/stdlib.fc',
    'contracts/imports/stdlib.fc'
  );
  console.log('stdlib.fc downloaded');

  const sources = (p) => {
    if (!fs.existsSync(p)) throw new Error('File not found: ' + p);
    return fs.readFileSync(p).toString('utf-8');
  };

  // Compile jetton-minter
  console.log('Compiling jetton-minter.fc...');
  const minterResult = await compileFunc({
    targets: ['contracts/jetton-minter.fc'],
    sources,
  });

  if (minterResult.status === 'error') {
    console.error('jetton-minter compile error:', minterResult.message);
    process.exit(1);
  }

  fs.writeFileSync('build/jetton-minter.boc', Buffer.from(minterResult.codeBoc, 'base64'));
  console.log('jetton-minter.boc written');

  // Compile jetton-wallet
  console.log('Compiling jetton-wallet.fc...');
  const walletResult = await compileFunc({
    targets: ['contracts/jetton-wallet.fc'],
    sources,
  });

  if (walletResult.status === 'error') {
    console.error('jetton-wallet compile error:', walletResult.message);
    process.exit(1);
  }

  fs.writeFileSync('build/jetton-wallet.boc', Buffer.from(walletResult.codeBoc, 'base64'));
  console.log('jetton-wallet.boc written');

  console.log('Compilation successful!');
  console.log('Build dir:', fs.readdirSync('build'));
}

main().catch(e => { console.error(e); process.exit(1); });
