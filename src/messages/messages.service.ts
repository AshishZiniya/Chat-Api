import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDoc } from './messages.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDoc>,
  ) {}

  async save(from: string, to: string, text: string): Promise<MessageDoc> {
    const m = new this.messageModel({ from, to, text });
    return m.save() as Promise<MessageDoc>;
  }

  async saveFile(
    from: string,
    to: string,
    fileUrl: string,
    fileName: string,
    fileSize: number,
    fileType: string,
  ): Promise<MessageDoc> {
    const m = new this.messageModel({
      from,
      to,
      type: 'file',
      fileUrl,
      fileName,
      fileSize,
      fileType,
    });
    return m.save() as Promise<MessageDoc>;
  }

  async getConversation(a: string, b: string) {
    return this.messageModel
      .find({
        $and: [
          {
            $or: [
              { from: a, to: b },
              { from: b, to: a },
            ],
          },
          {
            deletedBy: { $nin: [a] }, // Don't show messages deleted by the requesting user
          },
        ],
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  async getPendingFor(userId: string) {
    return this.messageModel
      .find({
        to: userId,
        delivered: false,
        deletedBy: { $nin: [userId] }, // Don't include messages deleted by the receiver
      })
      .lean();
  }

  async markDeleted(id: string, userId: string) {
    const message = await this.findById(id);
    if (!message) return null;

    // If sender is deleting, delete the message completely
    if (message.from === userId) {
      return this.messageModel.deleteOne({ _id: id }).exec();
    }

    // If receiver is deleting, only mark as deleted for receiver
    return this.messageModel
      .updateOne({ _id: id }, { $addToSet: { deletedBy: userId } })
      .exec();
  }

  async findById(id: string) {
    return this.messageModel.findById(id).lean();
  }

  async markDelivered(messageIds: string[]) {
    return this.messageModel
      .updateMany({ _id: { $in: messageIds } }, { $set: { delivered: true } })
      .exec();
  }

  async saveLocation(
    from: string,
    to: string,
    latitude: number,
    longitude: number,
    isLive: boolean = false,
  ): Promise<MessageDoc> {
    const m = new this.messageModel({
      from,
      to,
      type: 'location',
      latitude,
      longitude,
      isLive,
    });
    return m.save() as Promise<MessageDoc>;
  }

  async saveEmoji(
    from: string,
    to: string,
    emoji: string,
  ): Promise<MessageDoc> {
    const m = new this.messageModel({
      from,
      to,
      type: 'emoji',
      text: emoji,
    });
    return m.save() as Promise<MessageDoc>;
  }

  async saveGif(from: string, to: string, gifUrl: string): Promise<MessageDoc> {
    const m = new this.messageModel({
      from,
      to,
      type: 'gif',
      text: gifUrl,
    });
    return m.save() as Promise<MessageDoc>;
  }

  async saveSticker(
    from: string,
    to: string,
    stickerUrl: string,
  ): Promise<MessageDoc> {
    const m = new this.messageModel({
      from,
      to,
      type: 'sticker',
      text: stickerUrl,
    });
    return m.save() as Promise<MessageDoc>;
  }

  async saveWebView(
    from: string,
    to: string,
    url: string,
    title?: string,
    description?: string,
    imageUrl?: string,
  ) {
    const m = new this.messageModel({
      from,
      to,
      type: 'webview',
      webUrl: url,
      webTitle: title,
      webDescription: description,
      webImageUrl: imageUrl,
    });
    return m.save();
  }
}
