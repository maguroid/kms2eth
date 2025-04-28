# kms2eth

> Convert an **AWS KMS secp256k1** key into its corresponding **Ethereum address** —in a single command.

`kms2eth` is a minimal CLI utility written in TypeScript + [Bun](https://bun.sh). It fetches the public key of a secp256k1‑based key stored in AWS KMS, hashes it with Keccak‑256, and prints the Ethereum address (with optional [EIP‑55](https://eips.ethereum.org/EIPS/eip-55) checksum).

---

## Features

- ⛓ **Chain‑agnostic hashing** – works for mainnet, testnets, L2s… anything that uses secp256k1.
- 🪪 **AWS profile & region aware** – switch credentials via `--profile`/`AWS_PROFILE` & `--region`.
- ⚡️ **Smart local cache** – results cached in `~/.cache/kms2eth/cache.json`.

---

## Installation

```bash
# With Bun (recommended)
bun install -g kms2eth

# Or clone & run locally
git clone https://github.com/maguroid/kms2eth && cd kms2eth
bun install
bun kms2eth --help
```

> **Prerequisites**
>
> - [Bun v1.1+](https://bun.sh)
> - IAM credentials able to call `kms:GetPublicKey`

---

## Quick Start

```bash
# Address of a key in ap-northeast-1
kms2eth --key-id alias/my-eth-key --region ap-northeast-1

# Switch AWS profile on the fly
kms2eth -k 1234abcd-56ef-7890-1234-abcdef012345 --profile staging
```

Output:

```
0x1234aBcD5678Ef901234AbCdEf0123456789abcd
```

---

## CLI Options

| Flag                         | Description                           | Default                      |
| ---------------------------- | ------------------------------------- | ---------------------------- |
| `-k, --key-id <id>`          | **Required.** KMS KeyId or alias      | —                            |
| `-r, --region <awsRegion>`   | AWS region                            | `us-east-1` or `$AWS_REGION` |
| `-p, --profile <awsProfile>` | AWS credential profile                | `$AWS_PROFILE`               |
| `--no-checksum`              | Output lowercase hex (disable EIP‑55) | checksum **on**              |
| `-h, --help`                 | Show help                             | —                            |
| `-V, --version`              | Print version                         | —                            |

---

## Caching Behaviour

Addresses are memoised per **Account ID / Region / KeyId** triple and stored at:

```
~/.cache/kms2eth/cache.json
```

Delete the file to force a fresh lookup.

---

## Exit Codes

| Code | Meaning                                        |
| ---: | ---------------------------------------------- |
|  `0` | Success                                        |
|  `1` | Generic/unknown error                          |
|  `2` | `NotFoundException` – key/alias not found      |
|  `3` | `DisabledException` – key is disabled          |
|  `4` | `KMSServiceException` – AWS service‑side error |
|  `5` | Any other unexpected error                     |

---

## IAM Policy Example

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "kms:GetPublicKey",
      "Resource": "arn:aws:kms:*:123456789012:key/1234abcd-56ef-7890-1234-abcdef012345"
    }
  ]
}
```

---

## Troubleshooting

- **`❌ could not find key`** – confirm the KeyId/alias & region, and that your IAM role has `kms:DescribeKey`.
- **Region mismatch** – the CLI does not retry across regions; pass `--region` explicitly.
- **Checksum looks wrong** – use `--no-checksum` to output raw lowercase hex for debugging.

---

## License

MIT © 2025 [maguroid](https://github.com/maguroid)
