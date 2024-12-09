import { ChannelMessage, EButtonMessageStyle, EMessageComponentType } from 'mezon-sdk';
import { Command } from 'src/bot/base/commandRegister.decorator';
import { CommandMessage } from '../../abstracts/command.abstract';
import {
  EmbedProps,
  ERequestAbsenceType,
  MEZON_EMBED_FOOTER,
} from 'src/bot/constants/configs';
import { getRandomColor } from 'src/bot/utils/helper';
import { InjectRepository } from '@nestjs/typeorm';
import { User, AbsenceDayRequest } from '../../../models';
import { TimeSheetService } from '../../../services/timesheet.services';
import { Repository } from 'typeorm';
import { MezonClientService } from '../../../../mezon/services/client.service';
import { AxiosClientService } from 'src/bot/services/axiosClient.services';
import { ClientConfigService } from 'src/bot/config/client-config.service';
@Command('off')
export class OffCommand extends CommandMessage {
  constructor(
    private clientService: MezonClientService,
    @InjectRepository(AbsenceDayRequest)
    private absenceDayRequestRepository: Repository<AbsenceDayRequest>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private axiosClientService: AxiosClientService,
    private clientConfigService: ClientConfigService,
    private timeSheetService: TimeSheetService,
  ) {
    super();
  }

  async execute(args: string[], message: ChannelMessage) {
    const senderId = message.sender_id;
    const findUser = await this.userRepository
      .createQueryBuilder()
      .where(`"userId" = :userId`, { userId: senderId })
      .andWhere(`"deactive" IS NOT true`)
      .select('*')
      .getRawOne();
    if (!findUser) return;

    const absenceAllType = await this.timeSheetService.getAllTypeAbsence();
    const optionsAbsenceType = absenceAllType.data.result.map((item) => ({
      label: item.name,
      value: item.id,
    }));
    const embed: EmbedProps[] = [
      {
        color: getRandomColor(),
        title: `Off`,
        author: {
          name: findUser.username,
          icon_url: findUser.avatar,
          url: findUser.avatar,
        },
        fields: [
          {
            name: 'Date',
            value: '',
            inputs: {
              id: 'dateAt',
              type: EMessageComponentType.INPUT,
              required: true,
              component: {
                id: 'date',
                placeholder: 'dd-mm-yyyy',
                required: true,
              },
            },
          },
          {
            name: 'Date Type',
            value: '',
            inputs: {
              id: 'dateType',
              type: EMessageComponentType.SELECT,
              component: {
                max_options: 1,
                required: true,
                options: [
                  {
                    label: 'Full Day',
                    value: 'FULL_DAY',
                  },
                  {
                    label: 'Morning',
                    value: 'MORNING',
                  },
                  {
                    label: 'Afternoon',
                    value: 'AFTERNOON',
                  },
                ],
              },
            },
          },
          {
            name: 'Absence Type',
            value: '',
            inputs: {
              id: 'absenceType',
              type: EMessageComponentType.SELECT,
              component: {
                max_options: 1,
                options: optionsAbsenceType,
              },
            },
          },
          {
            name: 'Reason',
            value: '',
            inputs: {
              id: 'reason',
              type: EMessageComponentType.INPUT,
              component: {
                id: 'reason',
                placeholder: 'Reason',
                required: true,
                textarea: true,
              },
            },
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
            id: 'off_CANCEL',
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Cancel`,
              style: EButtonMessageStyle.SECONDARY,
            },
          },
          {
            id: 'off_CONFIRM',
            type: EMessageComponentType.BUTTON,
            component: {
              label: `Confirm`,
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
    const dataInsert = new AbsenceDayRequest();
    dataInsert.messageId = response.message_id;
    dataInsert.userId = message.sender_id;
    dataInsert.clanId = message.clan_id;
    dataInsert.channelId = message.channel_id;
    dataInsert.modeMessage = message.mode;
    dataInsert.isChannelPublic = message.is_public;
    dataInsert.createdAt = Date.now();
    dataInsert.type = ERequestAbsenceType.OFF;
    await this.absenceDayRequestRepository.save(dataInsert);
    return null;
  }
}
