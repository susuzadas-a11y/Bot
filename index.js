require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const express = require('express');

const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || '.';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Armazena as salas e o progresso de "GO"
const activeRooms = new Map();

client.on('ready', () => {
  console.log(`✅ Bot FF Xellon V5 online: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot && message.author.id === client.user.id) return;

  const content = message.content.trim();

  // 1. CAPTURA DE ID E SENHA (Formato: 1026833 22)
  const roomPattern = /^(\d{7,9})\s+(\d{1,6})$/;
  const match = content.match(roomPattern);

  if (match) {
    const roomId = match[1];
    const roomPass = match[2];

    console.log(`🎯 Nova Sala Detectada! ID: ${roomId} | Senha: ${roomPass}`);

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎮 SALA FF - GERENCIAMENTO ATIVO')
      .setDescription('Aguardando os jogadores digitarem **go** para iniciar!')
      .addFields(
        { name: '🆔 ID da Sala', value: `\`${roomId}\``, inline: true },
        { name: '🔑 Senha', value: `\`${roomPass}\``, inline: true },
        { name: '🚦 Progresso GO', value: '`0/2 jogadores prontos`', inline: false },
        { name: '⏰ Início Automático', value: '`3 minutos`', inline: false }
      )
      .setThumbnail('https://i.imgur.com/8N6R0mY.png')
      .setFooter({ text: 'Xellon FF Integrator' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`force_start_${roomId}`)
        .setLabel('FORÇAR GO')
        .setEmoji('🚀')
        .setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

    activeRooms.set(roomId, {
      messageId: sentMessage.id,
      channelId: message.channel.id,
      id: roomId,
      pass: roomPass,
      status: 'waiting',
      goCount: 0,
      voters: new Set()
    });

    // Timer de 3 minutos para segurança
    setTimeout(async () => {
      const room = activeRooms.get(roomId);
      if (room && room.status === 'waiting') {
        await triggerGo(message.channel, roomId, 'Tempo esgotado (3 min)');
      }
    }, 3 * 60 * 1000);

    return;
  }

  // 2. CONTADOR DE "GO" DOS JOGADORES
  if (content.toLowerCase() === 'go') {
    // Procurar se existe alguma sala aguardando no canal
    for (const [id, room] of activeRooms.entries()) {
      if (room.channelId === message.channel.id && room.status === 'waiting') {
        
        if (room.voters.has(message.author.id)) return; // Um voto por pessoa

        room.goCount++;
        room.voters.add(message.author.id);

        console.log(`☝️ Voto GO detectado (${room.goCount}/2) para sala ${id}`);

        // Atualizar Embed
        const msg = await message.channel.messages.fetch(room.messageId).catch(() => null);
        if (msg) {
          const embed = EmbedBuilder.from(msg.embeds[0]);
          embed.setFields(
            { name: '🆔 ID da Sala', value: `\`${room.id}\``, inline: true },
            { name: '🔑 Senha', value: `\`${room.pass}\``, inline: true },
            { name: '🚦 Progresso GO', value: `\`${room.goCount}/2 jogadores prontos\``, inline: false },
            { name: '⏰ Início Automático', value: '`3 minutos`', inline: false }
          );
          await msg.edit({ embeds: [embed] });
        }

        // Se atingir 2, dá o GO
        if (room.goCount >= 2) {
          await triggerGo(message.channel, id, 'Meta de jogadores atingida');
        }
        break;
      }
    }
  }
});

// ─── Lógica de Botão (Forçar Início) ──────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('force_start_')) {
    const roomId = interaction.customId.replace('force_start_', '');
    const room = activeRooms.get(roomId);

    if (!room || room.status !== 'waiting') return interaction.reply({ content: '❌ Sala inativa.', ephemeral: true });

    await interaction.reply({ content: '🚀 Forçando início da partida...', ephemeral: true });
    await triggerGo(interaction.channel, roomId, 'Iniciado manualmente pelo admin');
  }
});

// ─── Função de Início (GO) ───────────────────────────────────────────────────
async function triggerGo(channel, roomId, reason) {
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'waiting') return;

  room.status = 'started';

  const embedGo = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🔥 PARTIDA INICIADA - GO!')
    .setDescription(`A sala **${roomId}** começou! Boa sorte a todos.`)
    .addFields(
      { name: '📝 Motivo', value: `\`${reason}\``, inline: true },
      { name: '👥 Jogadores', value: '`Monitorando partida...`', inline: false }
    )
    .setTimestamp();

  const msg = await channel.messages.fetch(room.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [embedGo], components: [] });

  // Simulação de Fim de Jogo
  setTimeout(async () => {
    const embedEnd = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏁 BOOYAH! PARTIDA ENCERRADA')
      .addFields(
        { name: '🏆 GANHADOR', value: '⭐ **TIME A**', inline: true },
        { name: '👥 Jogadores', value: '`Player1, Player2, Player3, Player4`', inline: false }
      )
      .setTimestamp();
    
    if (msg) await msg.edit({ embeds: [embedEnd] });
    activeRooms.delete(roomId);
  }, 20000);
}

const app = express();
app.get('/', (req, res) => res.send('🤖 Xellon V5 Running!'));
app.listen(process.env.PORT || 3000);

if (!TOKEN || TOKEN === 'SEU_TOKEN_AQUI') {
  console.error('❌ Token não configurado!');
  process.exit(1);
}
client.login(TOKEN);
