# RuRcoin (RURC) — Деплой на TON Mainnet

## Параметры токена
| Параметр | Значение |
|---|---|
| Название | RuRcoin |
| Символ | RURC |
| Supply | 10,000,000 |
| Decimals | 9 |
| Комиссия | 3% (1.5% burn + 1.5% owner) |
| Сеть | TON Mainnet |

## Требования
- Node.js 18+
- ~0.5 TON на кошельке деплоера (для газа)
- API ключ toncenter.com (бесплатный)

## Шаги деплоя

### 1. Установи зависимости
```bash
npm install @ton/ton @ton/crypto
```

### 2. Скомпилируй контракты
Используй [Blueprint](https://github.com/ton-org/blueprint) или [toncli](https://github.com/disintar/toncli):
```bash
# Через Blueprint
npm create ton@latest
# Скопируй .fc файлы в contracts/
npx blueprint build
```

### 3. Настрой переменные окружения
```bash
export DEPLOYER_MNEMONIC="слово1 слово2 ... слово24"
export TONCENTER_API_KEY="твой_ключ_с_toncenter.com"
```

### 4. Задеплой
```bash
npx ts-node deploy.ts
```

### 5. Проверь на tonviewer.com
После деплоя скрипт выведет адрес контракта.
Проверь: https://tonviewer.com/АДРЕС_КОНТРАКТА

## Как работает комиссия
При каждом transfer:
- Отправитель отправляет 100 RURC
- Получатель получает **97 RURC**
- **1.5 RURC** сжигается (уменьшает total supply)
- **1.5 RURC** уходит на `UQB3PcMK0rW2etIRSV0IVnPZYf8xRC4b-h0wcsKNe7v5E-02`

## Файлы
- `jetton-minter.fc` — основной контракт (управление supply)
- `jetton-wallet.fc` — кошелёк с комиссией
- `deploy.ts` — скрипт деплоя
