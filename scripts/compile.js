const { compileFunc } = require('@ton-community/func-js');
const fs = require('fs');
const path = require('path');

async function main() {
  fs.mkdirSync('build', { recursive: true });

  // Compile jetton-minter
  console.log('Compiling jetton-minter.fc...');
  const minterResult = await compileFunc({
    targets: ['contracts/jetton-minter.fc'],
    sources: (path) => fs.readFileSync(path).toString('utf-8'),
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
    sources: (path) => fs.readFileSync(path).toString('utf-8'),
  });

  if (walletResult.status === 'error') {
    console.error('jetton-wallet compile error:', walletResult.message);
    process.exit(1);
  }

  fs.writeFileSync('build/jetton-wallet.boc', Buffer.from(walletResult.codeBoc, 'base64'));
  console.log('jetton-wallet.boc written');

  console.log('Compilation successful!');
  const files = fs.readdirSync('build');
  console.log('Build dir:', files);
}

main().catch(e => { console.error(e); process.exit(1); });
