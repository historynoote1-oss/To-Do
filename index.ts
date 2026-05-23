import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { config } from "dotenv";
import { prisma, initFonts } from "./client";
import { loadCommands } from "./src/handlers/commandHandler";
import { setupVoiceTracking } from "./src/handlers/voiceHandler";

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

(client as any).commands = new Collection();

client.once("ready", async () => {
  console.log(`✅ Bot is online as ${client.user?.tag}`);
  await initFonts();
  await loadCommands(client);
  setupVoiceTracking(client);
});

client.on("interactionCreate", async (interaction) => {

  // ────────────────────────────────────────────────────────────
  // 1. Slash Commands
  // ────────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = (client as any).commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error("Command error:", error);
      const reply = { content: "❌ An error occurred. Please try again.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
    return;
  }

  // ────────────────────────────────────────────────────────────
  // 2. Buttons
  // ────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith("time_") || customId.startsWith("tracking_") || customId.startsWith("ac_")) {
      const prefix  = customId.startsWith("time_") ? "time" : "tracking";
      const command = (client as any).commands.get(prefix);
      if (command && typeof command.handleButton === "function") {
        try {
          await command.handleButton(interaction);
        } catch (error) {
          console.error(`Button error [${prefix}]:`, error);
        }
      }
      return;
    }

    if (customId === "next3h_refresh") {
      const command = (client as any).commands.get("next3h");
      if (command?.handleButton) await command.handleButton(interaction);
      return;
    }

    // Anti-Cheat confirmation button
    if (customId.startsWith("anticheat_confirm_")) {
      const parts   = customId.split("_");
      const userId  = parts[2];
      const guildId = parts[3];
      try {
        const { handleAntiCheatConfirm } = require("./src/handlers/voiceHandler");
        await handleAntiCheatConfirm(userId, guildId);
        await interaction.update({
          embeds: [
            {
              title:       "✅ تم تأكيد تواجدك!",
              description: "شكراً! تم تسجيل تواجدك بنجاح. استمر في المذاكرة! 💪",
              color:       0x57F287,
            }
          ],
          components: [],
        });
      } catch (error) {
        console.error("AntiCheat confirm error:", error);
      }
      return;
    }

    // Focus Mode buttons
    if (customId.startsWith("focus_")) {
      const command = (client as any).commands.get("focus");
      if (command && typeof command.handleButton === "function") {
        try {
          await command.handleButton(interaction);
        } catch (error) {
          console.error("Focus button error:", error);
        }
      }
      return;
    }

    // Default button handler
    try {
      const { handleButton } = require("./src/handlers/buttonHandler");
      await handleButton(interaction, client);
    } catch (error) {
      console.error("Button error:", error);
    }
    return;
  }

  // ────────────────────────────────────────────────────────────
  // 3. String Select Menus
  // ────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith("tracking_") || interaction.customId.startsWith("ac_")) {
      const command = (client as any).commands.get("tracking");
      if (command && typeof command.handleSelectMenu === "function") {
        try {
          await command.handleSelectMenu(interaction);
        } catch (error) {
          console.error("SelectMenu error:", error);
        }
      }
    }
    return;
  }

  // ────────────────────────────────────────────────────────────
  // 4. Channel Select Menus (Focus Mode)
  // ────────────────────────────────────────────────────────────
  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId.startsWith("focus_")) {
      const command = (client as any).commands.get("focus");
      if (command && typeof command.handleSelectMenu === "function") {
        try {
          await command.handleSelectMenu(interaction);
        } catch (error) {
          console.error("Focus channel select error:", error);
        }
      }
    }
    return;
  }

  // ────────────────────────────────────────────────────────────
  // 5. Modals
  // ────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    try {
      const { handleModal } = require("./src/handlers/modalHandler");
      await handleModal(interaction, client);
    } catch (error) {
      console.error("Modal error:", error);
    }
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);

process.on("SIGTERM", async () => {
  console.log("SIGTERM — saving sessions...");
  const { shutdownSaveAll } = require("./src/handlers/voiceHandler");
  await shutdownSaveAll();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT — saving sessions...");
  const { shutdownSaveAll } = require("./src/handlers/voiceHandler");
  await shutdownSaveAll();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});
