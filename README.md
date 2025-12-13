# discord-active-bot

A Discord bot that helps manage server activity by tracking user engagement and providing moderation tools.

## What is a Discord Bot?

A Discord bot is an automated program that can interact with Discord servers (guilds) and users. Bots can perform various tasks such as:

- **Moderation**: Automatically manage users, filter content, and enforce rules
- **Automation**: Perform repetitive tasks like welcoming new members or cleaning up messages
- **Engagement**: Provide games, utilities, and interactive features for server members
- **Customization**: Extend Discord's functionality with server-specific features

Bots are added to servers by administrators and can be granted specific permissions to perform their functions.

## Discord Bot Setup Guide

### 1. Creating a Discord Bot and Getting a Token

To use this bot, you'll need to create a Discord application and get a bot token:

1. **Go to the Discord Developer Portal**:
   Visit [https://discord.com/developers/applications](https://discord.com/developers/applications)

2. **Create a New Application**:
   - Click "New Application" button
   - Enter a name for your bot (e.g., "Activity Monitor Bot")
   - Click "Create"

3. **Convert to a Bot**:
   - Navigate to the "Bot" tab in the left sidebar
   - Click "Add Bot" button
   - Confirm by clicking "Yes, do it!"

4. **Get Your Bot Token**:
   - Under the "TOKEN" section, click "Copy" to copy your bot token
   - **Important**: Never share this token or commit it to public repositories
   - If compromised, click "Regenerate" to get a new token

5. **Configure Bot Settings**:
   - Enable "Message Content Intent" (required for this bot to function properly)
   - Enable "Server Members Intent" (required for tracking user activity)
   - Enable "Presence Intent" (optional, for enhanced activity tracking)

### 2. Inviting the Bot to Your Server

After creating your bot, you need to invite it to your Discord server:

1. **Go to the OAuth2 URL Generator**:
   - In the Developer Portal, navigate to the "OAuth2" → "URL Generator" tab

2. **Select Bot Scopes and Permissions**:
   - Under "Scopes", check "bot" and "applications.commands"
   - Under "Bot Permissions", select the following permissions:
     - Manage Roles
     - Kick Members
     - Ban Members
     - Send Messages
     - Embed Links
     - Attach Files
     - Read Message History
     - Use Slash Commands
     - Moderate Members

3. **Generate and Use the Invite Link**:
   - Copy the generated URL at the bottom of the page
   - Open the URL in your browser
   - Select the server you want to add the bot to
   - Click "Continue" and then "Authorize"
   - Complete the CAPTCHA verification if prompted

4. **Verify Bot Installation**:
   - Go to your Discord server
   - Check if the bot appears in your member list (it will show as offline until you run it)

### 3. Bot Permissions Explained

This bot requires specific permissions to function properly:

| Permission           | Why It's Needed                            |
| -------------------- | ------------------------------------------ |
| Manage Roles         | To assign/unassign activity roles          |
| Kick Members         | To remove inactive members when configured |
| Ban Members          | For moderation features (optional)         |
| Send Messages        | To send warnings and notifications         |
| Embed Links          | To display rich content in messages        |
| Attach Files         | For logging and reporting features         |
| Read Message History | To track user activity in channels         |
| Use Slash Commands   | To provide interactive commands            |
| Moderate Members     | For timeout and moderation features        |

## Server Installation

### Prerequisites

- [Bun](https://bun.com) (v1.0.0 or later)
- Node.js (v18 or later, required for some dependencies)
- A Discord bot token (get one from [Discord Developer Portal](https://discord.com/developers/applications))
- Administrative access to a Discord server

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
# INACTIVE_AFTER_MS=864000000  # 10 days
# WARN_GRACE_MS=259200000      # 3 days
```

**Finding your APP_ID**:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Navigate to the "General Information" tab
4. Copy the "Application ID"

**Finding your FALLBACK_CHANNEL_ID**:

1. In Discord, enable Developer Mode (User Settings → Advanced → Developer Mode)
2. Right-click on the channel you want to use as fallback
3. Select "Copy Channel ID"

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

This will register all the bot's commands with Discord, making them available in your server.

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

## Troubleshooting

### Common Issues and Solutions

**Bot not appearing online**:

- Verify your token is correct in the `.env` file
- Check that the bot has been properly invited to your server
- Ensure the bot has the necessary intents enabled in the Developer Portal

**Commands not working**:

- Make sure you've run `bun run register` to register the commands
- Verify the bot has the "Use Slash Commands" permission in your server
- Check that the bot is properly online and connected

**Permission errors**:

- Ensure the bot has all required permissions (see permissions table above)
- Verify the bot role is positioned above the roles it needs to manage
- Check that the bot's role has the "Administrator" permission or specific permissions

**Database errors**:

- Verify the database directory exists and is writable
- Check that the `DB_PATH` in your `.env` file points to a valid location
- Ensure you have sufficient disk space

### Getting Help

If you encounter issues not covered here:

1. Check the bot logs for error messages
2. Review the [Discord Developer Documentation](https://discord.com/developers/docs/intro)
3. Visit the [Discord API Server](https://discord.gg/discord-api) for community support
4. Open an issue on the [GitHub repository](https://github.com/wighawag/discord-active-bot/issues)
