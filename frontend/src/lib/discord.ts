import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

export const discordSdk = new DiscordSDK(CLIENT_ID);

let cachedAuth: { access_token: string; guildId: string | null } | null = null;

export async function setupDiscordAuth() {
  if (cachedAuth) return cachedAuth;

  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  // بنبعت الـ code لباك إندنا عشان يستبدله بـ access_token
  const response = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const { access_token } = await response.json();

  await discordSdk.commands.authenticate({ access_token });

  cachedAuth = {
    access_token,
    guildId: discordSdk.guildId,
  };
  return cachedAuth;
}
