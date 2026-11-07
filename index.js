require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, REST, Routes, Collection } = require('discord.js');
const fs = require('fs');
const ms = require('ms');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const dbFile = './economy.json';
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '{}');

function getDB() {
  return JSON.parse(fs.readFileSync(dbFile));
}
function saveDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}
function getUser(id) {
  const db = getDB();
  if (!db[id]) {
    db[id] = { cash: 0, bank: 0, lastDaily: 0, lastWork: 0, lastRob: 0 };
    saveDB(db);
  }
  return db[id];
}

client.commands = new Collection();

const commands = [
  // ===== MODERATION =====
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('time').setDescription('Example: 10m, 1h, 1d').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('clear').setDescription('Clear messages')
    .addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true)),

  // ===== ECONOMY =====
  new SlashCommandBuilder().setName('balance').setDescription('Check balance')
    .addUserOption(o => o.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily reward'),
  new SlashCommandBuilder().setName('work').setDescription('Work for money'),
  new SlashCommandBuilder().setName('rob').setDescription('Rob someone')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('pay').setDescription('Pay someone')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Richest users')
];

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered');
  } catch (e) {
    console.error(e);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild, user } = interaction;

  // ========== MODERATION ==========
  if (commandName === 'warn') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'No permission', ephemeral: true });
    const target = options.getUser('user');
    const reason = options.getString('reason') || 'No reason';
    const embed = new EmbedBuilder().setColor('Yellow').setDescription(`**${target.tag}** has been warned.\nReason: ${reason}`);
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'mute') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: 'No permission', ephemeral: true });
    const target = options.getMember('user');
    const time = options.getString('time');
    const reason = options.getString('reason') || 'No reason';
    const msTime = ms(time);
    if (!msTime) return interaction.reply({ content: 'Invalid time (example: 10m, 1h, 1d)', ephemeral: true });
    await target.timeout(msTime, reason);
    await interaction.reply(`**${target.user.tag}** muted for ${time}. Reason: ${reason}`);
  }

  if (commandName === 'kick') {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: 'No permission', ephemeral: true });
    const target = options.getMember('user');
    const reason = options.getString('reason') || 'No reason';
    await target.kick(reason);
    await interaction.reply(`**${target.user.tag}** was kicked. Reason: ${reason}`);
  }

  if (commandName === 'ban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: 'No permission', ephemeral: true });
    const target = options.getUser('user');
    const reason = options.getString('reason') || 'No reason';
    await guild.members.ban(target, { reason });
    await interaction.reply(`**${target.tag}** was banned. Reason: ${reason}`);
  }

  if (commandName === 'clear') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'No permission', ephemeral: true });
    const amount = options.getInteger('amount');
    if (amount < 1 || amount > 100) return interaction.reply({ content: 'Amount must be 1-100', ephemeral: true });
    await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `Cleared ${amount} messages`, ephemeral: true });
  }

  // ========== ECONOMY ==========
  if (commandName === 'balance') {
    const target = options.getUser('user') || user;
    const data = getUser(target.id);
    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle(`${target.username}'s Balance`)
      .addFields(
        { name: 'Cash', value: `$${data.cash.toLocaleString()}`, inline: true },
        { name: 'Bank', value: `$${data.bank.toLocaleString()}`, inline: true },
        { name: 'Total', value: `$${(data.cash + data.bank).toLocaleString()}`, inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'daily') {
    const data = getUser(user.id);
    const now = Date.now();
    if (now - data.lastDaily < 86400000) {
      const left = ms(86400000 - (now - data.lastDaily), { long: true });
      return interaction.reply(`Come back in **${left}**`);
    }
    const amount = Math.floor(Math.random() * 1500) + 500;
    data.cash += amount;
    data.lastDaily = now;
    const db = getDB();
    db[user.id] = data;
    saveDB(db);
    await interaction.reply(`You claimed **$${amount.toLocaleString()}** daily reward!`);
  }

  if (commandName === 'work') {
    const data = getUser(user.id);
    const now = Date.now();
    if (now - data.lastWork < 3600000) {
      const left = ms(3600000 - (now - data.lastWork), { long: true });
      return interaction.reply(`You can work again in **${left}**`);
    }
    const jobs = ['Developer', 'Chef', 'Streamer', 'Taxi Driver', 'Mechanic', 'Designer'];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const amount = Math.floor(Math.random() * 400) + 100;
    data.cash += amount;
    data.lastWork = now;
    const db = getDB();
    db[user.id] = data;
    saveDB(db);
    await interaction.reply(`You worked as a **${job}** and earned **$${amount}**`);
  }

  if (commandName === 'rob') {
    const target = options.getUser('user');
    if (target.id === user.id) return interaction.reply('You can’t rob yourself');
    if (target.bot) return interaction.reply('You can’t rob bots');

    const thief = getUser(user.id);
    const victim = getUser(target.id);
    const now = Date.now();

    if (now - thief.lastRob < 7200000) {
      const left = ms(7200000 - (now - thief.lastRob), { long: true });
      return interaction.reply(`You can rob again in **${left}**`);
    }
    if (victim.cash < 100) return interaction.reply('This user is too poor to rob');

    const success = Math.random() < 0.45;
    thief.lastRob = now;

    if (success) {
      const stolen = Math.floor(victim.cash * (Math.random() * 0.3 + 0.1));
      victim.cash -= stolen;
      thief.cash += stolen;
      await interaction.reply(`You successfully robbed **$${stolen.toLocaleString()}** from **${target.username}**!`);
    } else {
      const fine = Math.floor(Math.random() * 300) + 100;
      thief.cash = Math.max(0, thief.cash - fine);
      await interaction.reply(`You got caught! You paid a **$${fine}** fine.`);
    }

    const db = getDB();
    db[user.id] = thief;
    db[target.id] = victim;
    saveDB(db);
  }

  if (commandName === 'pay') {
    const target = options.getUser('user');
    const amount = options.getInteger('amount');
    if (amount < 1) return interaction.reply('Amount must be positive');
    if (target.id === user.id) return interaction.reply('You can’t pay yourself');

    const sender = getUser(user.id);
    const receiver = getUser(target.id);

    if (sender.cash < amount) return interaction.reply('Not enough cash');

    sender.cash -= amount;
    receiver.cash += amount;

    const db = getDB();
    db[user.id] = sender;
    db[target.id] = receiver;
    saveDB(db);

    await interaction.reply(`You paid **$${amount.toLocaleString()}** to **${target.username}**`);
  }

  if (commandName === 'leaderboard') {
    const db = getDB();
    const sorted = Object.entries(db)
      .map(([id, data]) => ({ id, total: data.cash + data.bank }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    let desc = '';
    for (let i = 0; i < sorted.length; i++) {
      desc += `**${i + 1}.** <@${sorted[i].id}> — $${sorted[i].total.toLocaleString()}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('Richest Users')
      .setColor('Gold')
      .setDescription(desc || 'No data yet');
    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);