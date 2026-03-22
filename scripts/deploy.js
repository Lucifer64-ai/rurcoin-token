const { TonClient, WalletContractV4, internal, fromNano, toNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { Cell, Address, beginCell, StateInit, contractAddress } = require('@ton/core');
const fs = require('fs');
const path = require('path');

async function deploy() {
    const mnemonic = process.env.WALLET_MNEMONIC;
    const apiKey = process.env.TONCENTER_API_KEY;
    const ownerAddress = process.env.OWNER_ADDRESS || 'UQB3PcMK0rW2etIRSV0IVnPZYf8xRC4b-h0wcsKNe7v5E-02';

    if (!mnemonic) throw new Error('WALLET_MNEMONIC not set');
    if (!apiKey) throw new Error('TONCENTER_API_KEY not set');

    console.log('🚀 Starting RURC deploy...');
    console.log('Owner address:', ownerAddress);

    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: apiKey,
    });

    const words = mnemonic.trim().split(' ');
    const keyPair = await mnemonicToPrivateKey(words);
    const wallet = WalletContractV4.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
    });
    const walletContract = client.open(wallet);
    const walletAddress = wallet.address.toString({ bounceable: false });
    console.log('Deployer wallet:', walletAddress);

    const balance = await walletContract.getBalance();
    console.log('Balance:', fromNano(balance), 'TON');
    if (balance < toNano('0.3')) {
        throw new Error('Insufficient balance. Need at least 0.3 TON.');
    }

    // Load BOC files
    const minterBoc = fs.readFileSync(path.join(__dirname, '../build/jetton-minter.boc'));
    const walletBoc = fs.readFileSync(path.join(__dirname, '../build/jetton-wallet.boc'));

    const minterCode = Cell.fromBoc(minterBoc)[0];
    const walletCode = Cell.fromBoc(walletBoc)[0];

    // Jetton content cell (off-chain metadata URL)
    const jettonContent = beginCell()
        .storeUint(0x01, 8) // off-chain
        .storeStringTail('https://lucifer64-ai.github.io/rurcoin-mini-app/jetton-metadata.json')
        .endCell();

    // Initial minter data
    const adminAddr = Address.parse(ownerAddress);
    const minterData = beginCell()
        .storeCoins(0n)           // total_supply
        .storeAddress(adminAddr)  // admin_address
        .storeRef(jettonContent)  // content
        .storeRef(walletCode)     // jetton_wallet_code
        .endCell();

    // StateInit using @ton/core helper
    const init = { code: minterCode, data: minterData };
    const deployAddress = contractAddress(0, init);
    const deployAddressStr = deployAddress.toString({ bounceable: true });
    console.log('Contract address:', deployAddressStr);

    // Check if already active
    try {
        const state = await client.getContractState(deployAddress);
        if (state.state === 'active') {
            console.log('✅ Already deployed:', deployAddressStr);
            fs.writeFileSync('build/contract-address.txt', deployAddressStr);
            return;
        }
        console.log('Current state:', state.state);
    } catch (e) {
        console.log('State check error (normal for new contract):', e.message);
    }

    // Send deploy transaction
    const seqno = await walletContract.getSeqno();
    console.log('Seqno:', seqno);

    await walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: deployAddress,
                value: toNano('0.15'),
                init,
                body: beginCell().endCell(),
                bounce: false,
            }),
        ],
    });

    console.log('📤 Deploy tx sent. Waiting for confirmation...');

    // Wait up to 2 minutes
    for (let i = 1; i <= 40; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const state = await client.getContractState(deployAddress);
            console.log(`Attempt ${i}: state = ${state.state}`);
            if (state.state === 'active') {
                console.log('✅ Contract deployed successfully!');
                console.log('Address:', deployAddressStr);
                console.log('Explorer: https://tonviewer.com/' + deployAddressStr);
                fs.writeFileSync('build/contract-address.txt', deployAddressStr);
                return;
            }
        } catch (e) {
            console.log(`Attempt ${i}: error - ${e.message}`);
        }
    }

    // Even if timeout — save address anyway
    console.log('⚠️ Timeout but tx was sent. Contract address:', deployAddressStr);
    fs.writeFileSync('build/contract-address.txt', deployAddressStr);
    console.log('Check manually: https://tonviewer.com/' + deployAddressStr);
}

deploy().catch(e => {
    console.error('❌ Deploy failed:', e.message);
    process.exit(1);
});
