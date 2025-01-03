import { ChannelType, EMarkdownType } from 'mezon-sdk';
import { ChannelMezon, MezonBotMessage, User } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EMessageMode, EUserType } from '../constants/configs';
import { ClientConfigService } from '../config/client-config.service';
import { MessageQueue } from './messageQueue.service';
import { Injectable } from '@nestjs/common';
import { ReactMessageChannel } from '../asterisk-commands/dto/replyMessage.dto';
import { MezonClientService } from 'src/mezon/services/client.service';

@Injectable()
export class PollService {
  constructor(
    @InjectRepository(ChannelMezon)
    private channelRepository: Repository<ChannelMezon>,
    @InjectRepository(MezonBotMessage)
    private mezonBotMessageRepository: Repository<MezonBotMessage>,
    @InjectRepository(User) private userRepository: Repository<User>,
    private clientConfig: ClientConfigService,
    private messageQueue: MessageQueue,
    private clientService: MezonClientService,
  ) {}
  private emojiIdDefauly = {
    '1': '7249623295590321017',
    '2': '7249624251732854443',
    '3': '7249624274750507250',
    '4': '7249624293339259728',
    '5': '7249624315115336918',
    '6': '7249624334373657995',
    '7': '7249624356893400462',
    '8': '7249624383165932340',
    '9': '7249624408159143552',
    '10': '7249624441144979248',
    checked: '7237751213104827794',
  };

  getEmojiDefault() {
    return this.emojiIdDefauly;
  }

  getOptionPoll(pollString: string) {
    let option;
    const regex = /\d️⃣:\s*(.*)/g;
    const options = [];
    while ((option = regex.exec(pollString)) !== null) {
      options.push(option[1].trim());
    }

    return options;
  }

  getPollTitle(pollString: string) {
    let pollTitle;
    const match = pollString.toString().match(/\[Poll\] - (.*)\n/);
    if (match && match[1]) {
      pollTitle = match[1];
    }

    return pollTitle;
  }

  // TODO: split text
  // splitMessageByNewLines(message, maxNewLinesPerChunk = 100) {
  //   const lines = message.split('\n');
  //   const chunks = [];
  //   for (let i = 0; i < lines.length; i += maxNewLinesPerChunk) {
  //     chunks.push(lines.slice(i, i + maxNewLinesPerChunk).join('\n'));
  //   }
  //   return chunks;
  // };

  async handleResultPoll(findMessagePoll: MezonBotMessage) {
    try {
      let userReactMessageId =
        findMessagePoll.pollResult?.map((item) => JSON.parse(item)) || [];
      const options = this.getOptionPoll(findMessagePoll.content);
      const pollTitle = this.getPollTitle(findMessagePoll.content);
      let messageContent =
        '```' +
        `[Poll result] - ${pollTitle}` +
        '\n' +
        `Ding! Ding! Ding! Time's up! Results are`;
      if (userReactMessageId?.length) {
        const groupedByEmoji: { [key: string]: any[] } =
          userReactMessageId.reduce((acc: any, item) => {
            const { emoji } = item;
            if (!acc[emoji]) {
              acc[emoji] = [];
            }
            acc[emoji].push(item);
            return acc;
          }, {});

        for (const [emoji, users] of Object.entries(groupedByEmoji)) {
          const formattedUser = users
            .map((user) => `+ ${user.username}`)
            .join('\n\t');
          const optionByEmoji = options[+emoji];
          messageContent += `\n${optionByEmoji} (${users.length}):\n\t${formattedUser}`;
        }
      } else {
        messageContent += '\n\n(no one participated in the poll)';
      }

      await this.mezonBotMessageRepository.update(
        {
          messageId: findMessagePoll.messageId,
        },
        { deleted: true },
      );

      const findChannel = await this.channelRepository.findOne({
        where: {
          channel_id: findMessagePoll.channelId,
          clan_id: process.env.KOMUBOTREST_CLAN_NCC_ID,
        },
      });
      const isThread =
        findChannel?.channel_type === ChannelType.CHANNEL_TYPE_THREAD;
      const findUser = await this.userRepository.findOne({
        where: { userId: findMessagePoll.userId, user_type: EUserType.MEZON },
      });
      const textCreated =
        `\n\nPoll created by ${findUser?.username ?? ''}` + '```';
      const replyMessage = {
        clan_id: this.clientConfig.clandNccId,
        channel_id: findMessagePoll.channelId,
        is_public: findChannel ? !findChannel?.channel_private : false,
        is_parent_public: findChannel ? findChannel?.is_parent_public : true,
        parent_id: '0',
        mode: isThread
          ? EMessageMode.THREAD_MESSAGE
          : EMessageMode.CHANNEL_MESSAGE,
        msg: {
          t: messageContent + textCreated,
          mk: [
            {
              type: EMarkdownType.TRIPLE,
              s: 0,
              e: messageContent.length + textCreated.length,
            },
          ],
        },
      };
      this.messageQueue.addMessage(replyMessage);
    } catch (error) {
      console.log('handleResultPoll', error);
    }
  }

  async handelReactPollMessage(message, messageSent) {
    if (message.msg.t?.startsWith('```[Poll]') && messageSent.message_id) {
      const dataMezonBotMessage = {
        messageId: messageSent.message_id,
        userId: message.sender_id,
        channelId: message.channel_id,
        content: message.msg.t + '',
        createAt: Date.now(),
        pollResult: [],
      };
      await this.mezonBotMessageRepository.insert(dataMezonBotMessage);
      const options = this.getOptionPoll(message.msg.t);
      options.push('checked');
      options.forEach(async (option, index) => {
        const listEmoji = this.getEmojiDefault();
        const dataReact: ReactMessageChannel = {
          clan_id: message.clan_id,
          channel_id: message.channel_id,
          is_public: message.is_public,
          is_parent_public: message.is_parent_public,
          message_id: messageSent.message_id,
          emoji_id:
            option === 'checked'
              ? listEmoji[option]
              : listEmoji[index + 1 + ''],
          emoji: option === 'checked' ? option : index + '',
          count: 1,
          mode: message.mode,
          message_sender_id: process.env.BOT_KOMU_ID,
        };
        await this.clientService.reactMessageChannel(dataReact);
      });
    }
  }
}
