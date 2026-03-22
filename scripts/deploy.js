const { TonClient, WalletContractV4, internal, fromNano, toNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { Cell } = require('@ton/core');
const fs = require('fs');
const path = require('path');

async function deploy() {
    const mnemonic = process.env.WALLET_MNEMONIC;
    const apiKey = process.env.TONCENTER_API_KEY;
    const ownerAddress = process.env.OWNER_ADDRESS || 'UQBv5qIVT1x5BD1uOJFKqMMqQfZbdaqExRuIATNCn_HiCGoI';

    if (!mnemonic) throw new Error('WALLET_MNEMONIC not set');
    if (!apiKey) throw new Error('TONCENTER_API_KEY not set');

    console.log('🚀 Starting RURC deploy...');
    console.log('Owner address:', ownerAddress);

    // Connect to TON mainnet
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: apiKey,
    });

    // Restore wallet from mnemonic
    const words = mnemonic.trim().split(' ');
    const keyPair = await mnemonicToPrivateKey(words);
    const wallet = WalletContractV4.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
    });
    const walletContract = client.open(wallet);
    const walletAddress = wallet.address.toString({ bounceable: false });
    console.log('Deployer wallet:', walletAddress);

    // Check balance
    const balance = await walletContract.getBalance();
    console.log('Balance:', fromNano(balance), 'TON');
    if (balance < toNano('0.5')) {
        throw new Error('Insufficient balance. Need at least 0.5 TON for deploy.');
    }

    // Load compiled BOC files
    const minterBoc = fs.readFileSync(path.join(__dirname, '../build/jetton-minter.boc'));
    const walletBoc = fs.readFileSync(path.join(__dirname, '../build/jetton-wallet.boc'));

    const minterCode = Cell.fromBoc(minterBoc)[0];
    const walletCode = Cell.fromBoc(walletBoc)[0];

    // Build initial data for jetton-minter
    const { Address, beginCell } = require('@ton/core');
    const totalSupply = 0n; // starts at 0, mint separately
    const adminAddress = Address.parse(ownerAddress);

    // Jetton content (on-chain metadata)
    const jettonContent = beginCell()
        .storeUint(0, 8) // on-chain
        .storeStringTail('https://lucifer64-ai.github.io/rurcoin-mini-app/jetton-metadata.json')
        .endCell();

    const minterData = beginCell()
        .storeCoins(totalSupply)
        .storeAddress(adminAddress)
        .storeRef(jettonContent)
        .storeRef(walletCode)
        .endCell();

    // Build StateInit
    const stateInit = beginCell()
        .storeUint(0, 2)   // split_depth + special
        .storeMaybeRef(minterCode)
        .storeMaybeRef(minterData)
        .storeUint(0, 1)   // library
        .endCell();

    const contractAddress = new Address(0, stateInit.hash());
    const contractAddressStr = contractAddress.toString({ bounceable: true });
    console.log('Contract address:', contractAddressStr);

    // Check if already deployed
    try {
        const state = await client.getContractState(contractAddress);
        if (state.state === 'active') {
            console.log('✅ Contract already deployed at:', contractAddressStr);
            fs.writeFileSync('build/contract-address.txt', contractAddressStr);
            return;
        }
    } catch (e) {}

    // Deploy
    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: contractAddress,
                value: toNano('0.1'),
                init: stateInit,
                body: beginCell().endCell(),
                bounce: false,
            }),
        ],
    });

    console.log('📤 Deploy transaction sent. Waiting for confirmation...');

    // Wait for deploy
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const state = await client.getContractState(contractAddress);
            if (state.state === 'active') {
                console.log('✅ Contract deployed successfully!');
                console.log('Address:', contractAddressStr);
                console.log('Explorer: https://tonscan.org/address/' + contractAddressStr);
                fs.writeFileSync('build/contract-address.txt', contractAddressStr);
                return;
            }
        } catch (e) {}
        console.log('Waiting... attempt', i + 1);
    }

    throw new Error('Deploy timeout. Check transaction manually.');
}

deploy().catch(e => {
    console.error('❌ Deploy failed:', e.message);
    process.exit(1);
});
