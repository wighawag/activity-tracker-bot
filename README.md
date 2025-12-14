# activity-tracker-bot

A Discord bot that helps manage server activity by tracking user engagement, assigning activity-based roles, and providing moderation tools for inactive users.

## What is a Discord Bot?

A Discord bot is an automated program that can interact with Discord servers (guilds) and users. Bots can perform various tasks such as:

- **Moderation**: Automatically manage users, filter content, and enforce rules
- **Automation**: Perform repetitive tasks like welcoming new members or cleaning up messages
- **Engagement**: Track user activity and automatically assign roles based on participation levels
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
     - Send Messages
     - Embed Links
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
| Ban Members          | Not currently used by this bot             |
| Send Messages        | To send warnings and notifications         |
| Embed Links          | To display rich content in messages        |
| Attach Files         | Not currently used by this bot             |
| Read Message History | To track user activity in channels         |
| Use Slash Commands   | To provide interactive commands            |
| Moderate Members     | For timeout and moderation features        |

## How Activity Tracking Works

This bot tracks user activity and automatically manages roles based on participation:

### Activity States

- **Active**: Users who have sent messages within the last 10 days (configurable)
- **Inactive**: Users who haven't sent messages in 10-30 days (configurable)
- **Dormant**: Users who haven't sent messages in more than 30 days (configurable)

### Automatic Role Management

1. When a user sends a message, the bot records their activity
2. Every minute (configurable), the bot checks all users for activity
3. Users are automatically transitioned between roles based on their last activity:
   - **Active → Inactive**: After 10 days of no activity
   - **Inactive → Dormant**: After 30 days of no activity
   - **Any state → Active**: When a user sends a message

4. Users receive DM notifications when they transition to Inactive or Dormant states

### Manual Moderation

The `/kick-dormant` command allows moderators to kick users who have been in the Dormant state for the configured period.

## Server Installation

### Prerequisites

- [Bun](https://bun.com) (v1.0.0 or later)
- A Discord bot token (get one from [Discord Developer Portal](https://discord.com/developers/applications))
- Administrative access to a Discord server

### 1. Clone the repository

```bash
git clone https://github.com/wighawag/activity-tracker-bot.git
cd activity-tracker-bot
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
# Optional: FALLBACK_CHANNEL_ID=your_fallback_channel_id_here
# Optional: override timings for testing (in ms)
# Optional: override timings for testing (in ms)
# INACTIVE_AFTER_MS=864000000  # 10 days (default: users become inactive after 10 days of no activity)
# DORMANT_AFTER_MS=2592000000  # 30 days (default: users become dormant after 30 days of no activity)
# SWEEP_INTERVAL_MS=60000      # 1 minute (default: how often the bot checks for inactive users)
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
# ACTIVE_ROLE_NAME="Active"
# INACTIVE_ROLE_NAME="Inactive"
# DORMANT_ROLE_NAME="Dormant"
```

### 5. Register commands

Before running the bot, you must register the slash commands:

```bash
bun run register
```

This will register the `/kick-dormant` command with Discord, making it available in your server.

⚠️ **Important**: You only need to run this command once during initial setup, or when you update the bot's commands. Running it multiple times is unnecessary but harmless (Discord's API is idempotent).

### 6. Running the bot

For production, we recommend running the bot as a systemd service:

#### Option A: Run directly with Bun

```bash
bun run start [sync_time_window_ms]
```

**Parameters:**

- `sync_time_window_ms` (optional): Time window in milliseconds for member sync on startup
  - `0`: Sync all members
  - `3600000`: Sync members who joined in the last hour (default)
  - `86400000`: Sync members who joined in the last 24 hours
  - If not specified, defaults to 1 hour (3600000ms)

**Examples:**

```bash
# Sync all members (same as before)
bun run start 0

# Sync members from last hour (default)
bun run start

# Sync members from last 24 hours
bun run start 86400000

# Sync members from last 6 hours
bun run start 21600000
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
ExecStart=/usr/local/bin/bun run start 3600000
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

### 8. Updating the bot

To update the bot:

```bash
git pull
bun install
sudo systemctl restart discord-active-bot
```

## Troubleshooting

### Common Issues and Solutions

**Bot not appearing online**:

- Verify your token is correct in the `.env` file
- Check that the bot has been properly invited to your server
- Ensure the bot has the necessary intents enabled in the Developer Portal

**Commands not working**:

- Make sure you've run `bun run register` to register the commands (only `/kick-dormant` is available)
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

**Activity not tracked in private channels**:

- The bot tracks activity in all channels it has access to, including private channels restricted to specific roles
- If activity is not being tracked in a private channel, ensure the bot has "View Channel" and "Read Message History" permissions in that channel
- To update permissions for an existing private channel:
  1. Right-click the private channel in Discord
  2. Select "Edit Channel"
  3. Go to the "Permissions" tab
  4. Click "Add" under "Roles/Members"
  5. Search for and select your bot's role (or the bot user directly)
  6. Grant the following permissions:
     - View Channel
     - Read Message History
  7. Save the changes
- The bot will then be able to track activity in that channel

### Getting Help

If you encounter issues not covered here:

1. Check the bot logs for error messages
2. Review the [Discord Developer Documentation](https://discord.com/developers/docs/intro)
3. Visit the [Discord API Server](https://discord.gg/discord-api) for community support
4. Open an issue on the [GitHub repository](https://github.com/wighawag/discord-active-bot/issues)
