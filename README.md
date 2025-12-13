# discord-active-bot

## Server Installation

### Prerequisites

- [Bun](https://bun.com) (v1.0.0 or later)
- Node.js (v18 or later, required for some dependencies)
- A Discord bot token (get one from [Discord Developer Portal](https://discord.com/developers/applications))

### 1. Clone the repository

```bash
git clone https://github.com/wighawag/discord-active-bot.git
cd discord-active-bot
```

### 2. Install dependencies

```bash
bun install
```

### 3. Set up environment variables

Create a `.env` file based on the example:

```bash
cp .env.example .env
```

Edit the `.env` file with your bot token and other settings:

```env
DISCORD_TOKEN=your_bot_token_here
APP_ID=your_application_id_here
FALLBACK_CHANNEL_ID=your_fallback_channel_id_here
# Optional: override default timings (in milliseconds)
# INACTIVE_AFTER_MS=864000000
# WARN_GRACE_MS=259200000
# KICK_AFTER_MS=2592000000
```

### 4. Database setup

The bot uses SQLite for data storage. By default, it will create a database at `./activity.db`.

For production use, you may want to:

1. Create a dedicated directory for the database:

```bash
mkdir -p /var/lib/discord-active-bot/data
```

2. Set the `DB_PATH` environment variable in your `.env` file:

```env
DB_PATH=/var/lib/discord-active-bot/data/activity.db
```

### 5. Register commands

Before running the bot, register the slash commands:

```bash
bun run register
```

### 6. Running the bot

For production, we recommend running the bot as a systemd service:

#### Option A: Run directly with Bun

```bash
bun run start
```

#### Option B: Systemd service (recommended)

1. Create a service file at `/etc/systemd/system/discord-active-bot.service`:

```ini
[Unit]
Description=Discord Active Bot
After=network.target

[Service]
User=your_username
WorkingDirectory=/path/to/discord-active-bot
EnvironmentFile=/path/to/discord-active-bot/.env
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

2. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-active-bot
sudo systemctl start discord-active-bot
```

3. Check logs:

```bash
journalctl -u discord-active-bot -f
```

### 7. Updating the bot

To update the bot:

```bash
git pull
bun install
bun run build
sudo systemctl restart discord-active-bot
```
