import {
  ChannelMessage,
  EButtonMessageStyle,
  EMessageComponentType,
  MezonClient,
} from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import { CommandStorage } from 'src/bot/base/storage';
import { DynamicCommandService } from 'src/bot/services/dynamic.service';
import { InjectRepository } from '@nestjs/typeorm';
import { MenuOrder, MenuOrderMessage } from 'src/bot/models';
import { Like, Repository } from 'typeorm';
import {
  EmbedProps,
  MEZON_EMBED_FOOTER,
  TypeOrderMessage,
} from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { MezonClientService } from 'src/mezon/services/client.service';

@Command('menu')
export class MenuCommand extends CommandMessage {
  private client: MezonClient;
  private validCorner = new Map([
    [['vinh', 'v'], 'vinh'],
    [['hn1', 'hanoi1', 'h1'], 'hanoi1'],
    [['hn2', 'hanoi2', 'h2'], 'hanoi2'],
    [['hn3', 'hanoi3', 'h3'], 'hanoi3'],
    [['dn', 'd', 'danang'], 'danang'],
    [['qn', 'quynhon', 'q'], 'quynhon'],
    [['sg', 'saigon', 's'], 'saigon'],
  ]);
  constructor(
    private clientService: MezonClientService,
    @InjectRepository(MenuOrder)
    private menuRepository: Repository<MenuOrder>,
    @InjectRepository(MenuOrderMessage)
    private menuOrderMessageRepository: Repository<MenuOrderMessage>,
  ) {
    super();
    this.client = this.clientService.getClient();
  }

  getCorrectName(text: string): string | null {
    if (!text) return null;
    text = text.toLowerCase();
    for (const [keys, value] of this.validCorner) {
      if (keys.includes(text)) {
        return value;
      }
    }
    return null;
  }

  async execute(args: string[], message: ChannelMessage) {
    let messageContent = '```' + 'Command: *menu corner' + '```';
    if (args[0]) {
      if (!this.getCorrectName(args[0])) {
        messageContent = '```' + 'Not found this corner!' + '```';

        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
      const findMessageOrderExist = await this.menuOrderMessageRepository.find({
        where: {
          channelId: message.channel_id,
          clanId: message.clan_id,
          isEdited: false,
          type: TypeOrderMessage.CREATE,
        },
      });
      const newMessageContent =
        '```' +
        'A new menu has been created below, please order from that menu!' +
        '```';
      if (findMessageOrderExist.length > 0) {
        for (const {
          id,
          clanId,
          channelId,
          mode,
          isPublic,
          messageId,
        } of findMessageOrderExist) {
          await this.client.updateChatMessage(
            clanId,
            channelId,
            mode,
            isPublic,
            messageId,
            {
              t: newMessageContent,
              mk: [{ type: 't', s: 0, e: newMessageContent.length }],
            },
            [],
            [],
            true,
          );

          await this.menuOrderMessageRepository.update(
            { id },
            { isEdited: true },
          );
        }
      }
      const MenuList = await this.menuRepository.find({
        where: {
          corner: this.getCorrectName(args[0]),
        },
      });
      if (!MenuList.length) {
        messageContent = '```Menu not found!```';
        return this.replyMessageGenerate(
          {
            messageContent,
            mk: [{ type: 't', s: 0, e: messageContent.length }],
          },
          message,
        );
      }
      const mappedMenu = MenuList.reduce((acc, item) => {
        const categoryIndex = acc.findIndex(
          (obj) => obj.category === item.category,
        );

        if (categoryIndex !== -1) {
          acc[categoryIndex].menuList.push(item);
        } else {
          acc.push({
            category: item.category,
            menuList: [item],
          });
        }

        return acc;
      }, []);
      const formattedMenu = mappedMenu.map((categoryObj) => {
        return [
          {
            name: ``,
            value: '\n.',
          },
          {
            name: `${categoryObj.category}`,
            value: '',
          },
          {
            name: '',
            value: '',
            inputs: {
              id: `MENU`,
              type: EMessageComponentType.RADIO,
              component: categoryObj.menuList.map((menu) => ({
                label: '',
                value: `order_${menu?.id}`,
                description: `${menu?.name} - ${menu?.price}đ`,
                style: EButtonMessageStyle.SUCCESS,
              })),
            },
          },
        ];
      });
      const combinedMenu = formattedMenu.flat();
      const embed: EmbedProps[] = [
        {
          color: getRandomColor(),
          title: `MENU LIST ${this.getCorrectName(args[0]).toUpperCase()}`,
          description: "Let's order!!!",
          fields: [
            ...combinedMenu,
            {
              name: `\nEnjoy your meal!!!\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`,
              value: '',
            },
          ],
          timestamp: new Date().toISOString(),
          footer: MEZON_EMBED_FOOTER,
        },
      ];
      const components = [
        {
          components: [
            {
              id: `menu_FINISH_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${message.channel_id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Finish`,
                style: EButtonMessageStyle.DANGER,
              },
            },
            {
              id: `menu_REPORT_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${message.channel_id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Report`,
                style: EButtonMessageStyle.PRIMARY,
              },
            },
            {
              id: `menu_ORDER_${message.sender_id}_${message.clan_id}_${message.mode}_${message.is_public}_${message.channel_id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: `Order`,
                style: EButtonMessageStyle.SUCCESS,
              },
            },
          ],
        },
      ];

      const dataSend = this.replyMessageGenerate(
        {
          embed,
          components,
        },
        message,
      );
      const response = await this.clientService.sendMessage(dataSend);
      const menuOrderMessage = new MenuOrderMessage();
      menuOrderMessage.clanId = message.clan_id;
      menuOrderMessage.channelId = message.channel_id;
      menuOrderMessage.author = message.sender_id;
      menuOrderMessage.mode = message.mode;
      menuOrderMessage.isPublic = message.is_public;
      menuOrderMessage.createdAt = Date.now();
      menuOrderMessage.messageId = response.message_id;
      menuOrderMessage.type = TypeOrderMessage.CREATE;
      await this.menuOrderMessageRepository.save(menuOrderMessage);
      return null;
    }
    return this.replyMessageGenerate(
      {
        messageContent,
        mk: [{ type: 't', s: 0, e: messageContent.length }],
      },
      message,
    );
  }
}
