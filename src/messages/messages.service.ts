import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDoc, MessageType } from './messages.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDoc>,
  ) {}

  async save(
    from: string,
    to: string,
    text: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<MessageDoc> {
    if (!text?.trim()) {
      throw new BadRequestException('Message text cannot be empty');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      text: text.trim(),
      type,
    });

    return message.save();
  }

  async saveFile(
    from: string,
    to: string,
    fileUrl: string,
    fileName: string,
    fileSize: number,
    fileType: string,
  ): Promise<MessageDoc> {
    if (!fileUrl || !fileName || fileSize <= 0) {
      throw new BadRequestException('Invalid file data provided');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      type: MessageType.FILE,
      fileUrl,
      fileName,
      fileSize,
      fileType,
    });

    return message.save();
  }

  async getConversation(
    a: string,
    b: string,
    limit: number = 50,
    skip: number = 0,
  ) {
    const userA = new Types.ObjectId(a);
    const userB = new Types.ObjectId(b);

    return this.messageModel
      .find({
        $and: [
          {
            $or: [
              { from: userA, to: userB },
              { from: userB, to: userA },
            ],
          },
          {
            deletedBy: { $nin: [userA] }, // Don't show messages deleted by the requesting user
          },
        ],
      })
      .populate('from', 'username avatar online')
      .populate('to', 'username avatar online')
      .populate('replyId', 'text type from createdAt')
      .sort({ createdAt: -1 }) // Get latest first for pagination
      .skip(skip)
      .limit(limit)
      .lean()
      .then((messages) => messages.reverse()); // Reverse to show chronological order
  }

  async searchConversation(
    a: string,
    b: string,
    query: string,
    limit: number = 50,
    skip: number = 0,
  ) {
    const userA = new Types.ObjectId(a);
    const userB = new Types.ObjectId(b);

    return this.messageModel
      .find({
        $and: [
          {
            $or: [
              { from: userA, to: userB },
              { from: userB, to: userA },
            ],
          },
          {
            deletedBy: { $nin: [userA] }, // Don't show messages deleted by the requesting user
          },
          {
            $or: [
              { text: { $regex: query, $options: 'i' } },
              { fileName: { $regex: query, $options: 'i' } },
            ],
          },
        ],
      })
      .populate('from', 'username avatar online')
      .populate('to', 'username avatar online')
      .populate('replyId', 'text type from createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .then((messages) => messages.reverse());
  }

  async getPendingFor(userId: string, limit: number = 20) {
    const userObjectId = new Types.ObjectId(userId);

    return this.messageModel
      .find({
        to: userObjectId,
        delivered: false,
        deletedBy: { $nin: [userObjectId] }, // Don't include messages deleted by the receiver
      })
      .populate('from', 'username avatar online')
      .populate('to', 'username avatar online')
      .populate('replyId', 'text type from createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .then((messages) => messages.reverse());
  }

  async markDeleted(id: string, userId: string) {
    const message = await this.findById(id);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const messageId = new Types.ObjectId(id);
    const userObjectId = new Types.ObjectId(userId);

    // Verify user has permission to delete this message
    const fromId =
      typeof message.from === 'string' ? message.from : message.from.toString();
    const toId =
      typeof message.to === 'string' ? message.to : message.to.toString();

    if (fromId !== userId && toId !== userId) {
      throw new BadRequestException('You can only delete your own messages');
    }

    // If sender is deleting, delete the message completely
    if (fromId === userId) {
      return this.messageModel.deleteOne({ _id: messageId }).exec();
    }

    // If receiver is deleting, only mark as deleted for receiver
    return this.messageModel
      .updateOne({ _id: messageId }, { $addToSet: { deletedBy: userObjectId } })
      .exec();
  }

  async findById(id: string) {
    const messageId = new Types.ObjectId(id);
    return this.messageModel.findById(messageId).lean();
  }

  async markDelivered(messageIds: string[]) {
    const objectIds = messageIds.map((id) => new Types.ObjectId(id));
    return this.messageModel
      .updateMany({ _id: { $in: objectIds } }, { $set: { delivered: true } })
      .exec();
  }

  async saveLocation(
    from: string,
    to: string,
    latitude: number,
    longitude: number,
    isLive: boolean = false,
  ): Promise<MessageDoc> {
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Invalid coordinates provided');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      type: MessageType.LOCATION,
      latitude,
      longitude,
      isLive,
    });

    return message.save();
  }

  async saveEmoji(
    from: string,
    to: string,
    emoji: string,
  ): Promise<MessageDoc> {
    if (!emoji?.trim()) {
      throw new BadRequestException('Emoji cannot be empty');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      type: MessageType.EMOJI,
      text: emoji.trim(),
    });

    return message.save();
  }

  async saveGif(from: string, to: string, gifUrl: string): Promise<MessageDoc> {
    if (!gifUrl?.trim()) {
      throw new BadRequestException('GIF URL cannot be empty');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      type: MessageType.GIF,
      text: gifUrl.trim(),
    });

    return message.save();
  }

  async saveSticker(
    from: string,
    to: string,
    stickerUrl: string,
  ): Promise<MessageDoc> {
    if (!stickerUrl?.trim()) {
      throw new BadRequestException('Sticker URL cannot be empty');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      type: MessageType.STICKER,
      text: stickerUrl.trim(),
    });

    return message.save();
  }

  async saveWebView(
    from: string,
    to: string,
    url: string,
    title?: string,
    description?: string,
    imageUrl?: string,
  ): Promise<MessageDoc> {
    if (!url?.trim()) {
      throw new BadRequestException('Web URL cannot be empty');
    }

    const fromId = new Types.ObjectId(from);
    const toId = new Types.ObjectId(to);

    const message = new this.messageModel({
      from: fromId,
      to: toId,
      type: MessageType.WEBVIEW,
      webUrl: url.trim(),
      webTitle: title?.trim(),
      webDescription: description?.trim(),
      webImageUrl: imageUrl?.trim(),
    });

    return message.save();
  }

  async getRecentDeletionsForUser(userId: string, since?: Date) {
    const userObjectId = new Types.ObjectId(userId);
    const cutoffDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    // Find messages that were deleted recently and involve this user
    return this.messageModel
      .find({
        $or: [{ from: userObjectId }, { to: userObjectId }],
        deletedBy: { $exists: true, $ne: [] },
        updatedAt: { $gte: cutoffDate },
      })
      .select('_id from to deletedBy updatedAt')
      .lean()
      .then((messages) =>
        messages.map((msg) => ({
          messageId: msg._id.toString(),
          deletedBy: (msg.deletedBy || []).map((id) => id.toString()),
          conversationId: `${msg.from.toString()}-${msg.to.toString()}`,
          deletedAt: msg.updatedAt,
        })),
      );
  }
}
