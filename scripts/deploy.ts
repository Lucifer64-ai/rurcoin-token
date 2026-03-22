import { TonClient, WalletContractV4, internal, toNano, beginCell, Cell, Address } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import * as fs from "fs";

// ── Конфигурация ─────────────────────────────────────────────────────
const OWNER_ADDRESS = "UQB3PcMK0rW2etIRSV0IVnPZYf8xRC4b-h0wcsKNe7v5E-02";
const TOTAL_SUPPLY  = 10_000_000n * (10n ** 9n);  // 10M с decimals 9
const TOKEN_NAME    = "RuRcoin";
const TOKEN_SYMBOL  = "RURC";
const TOKEN_DECIMALS = 9;

// ── Метаданные токена (on-chain) ──────────────────────────────────────
function buildTokenContent(): Cell {
    const meta = beginCell()
        .storeUint(0, 8)  // snake format
        .storeBuffer(Buffer.from(JSON.stringify({
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            decimals: TOKEN_DECIMALS.toString(),
            description: "RuRcoin — Oil & Gas DeFi token on TON",
            image: "https://lucifer64-ai.github.io/rurcoin-mini-app/icon.png"
        })));
    return beginCell().storeUint(1, 8).storeRef(meta.endCell()).endCell();
}

async function deploy() {
    // 1. Загружаем скомпилированный код
    const minterCode = Cell.fromBoc(fs.readFileSync("build/jetton-minter.boc"))[0];
    const walletCode = Cell.fromBoc(fs.readFileSync("build/jetton-wallet.boc"))[0];

    // 2. Подключаемся к Mainnet
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC",
        apiKey: process.env.TONCENTER_API_KEY  // получи на toncenter.com
    });

    // 3. Кошелёк деплоера (твой мнемоник)
    const mnemonic = process.env.DEPLOYER_MNEMONIC!.split(" ");
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const contract = client.open(wallet);

    // 4. Начальное состояние Minter
    const ownerAddr = Address.parse(OWNER_ADDRESS);
    const content = buildTokenContent();
    const minterData = beginCell()
        .storeUint(0, 128)           // total_supply = 0 (минтим после деплоя)
        .storeAddress(ownerAddr)     // admin
        .storeRef(content)           // metadata
        .storeRef(walletCode)        // wallet code
        .endCell();

    const minterStateInit = beginCell()
        .storeUint(0, 2)
        .storeRef(minterCode)
        .storeRef(minterData)
        .storeUint(0, 1)
        .endCell();

    const minterAddress = new Address(0, minterStateInit.hash());
    console.log("📍 Minter address:", minterAddress.toString());

    // 5. Деплой Minter
    const seqno = await contract.getSeqno();
    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({
            to: minterAddress,
            value: toNano("0.1"),
            init: { code: minterCode, data: minterData },
            body: beginCell().endCell()
        })]
    });
    console.log("✅ Minter задеплоен! Ждём 15 сек...");
    await new Promise(r => setTimeout(r, 15000));

    // 6. Минтим 10,000,000 RURC на кошелёк владельца
    const mintBody = beginCell()
        .storeUint(21, 32)           // op::mint
        .storeUint(0, 64)            // query_id
        .storeAddress(ownerAddr)     // to
        .storeCoins(TOTAL_SUPPLY)    // amount
        .storeRef(
            beginCell()
                .storeUint(0x178d4519, 32)  // op::internal_transfer
                .storeUint(0, 64)
                .storeCoins(TOTAL_SUPPLY)
                .storeAddress(minterAddress)
                .storeAddress(ownerAddr)
                .storeCoins(toNano("0.01"))
                .storeBit(0)
            .endCell()
        )
        .endCell();

    const seqno2 = await contract.getSeqno();
    await contract.sendTransfer({
        seqno: seqno2,
        secretKey: keyPair.secretKey,
        messages: [internal({
            to: minterAddress,
            value: toNano("0.15"),
            body: mintBody
        })]
    });
    console.log("✅ Минт 10,000,000 RURC выполнен!");
    console.log("🔗 Проверь: https://tonviewer.com/" + minterAddress.toString());
}

deploy().catch(console.error);
