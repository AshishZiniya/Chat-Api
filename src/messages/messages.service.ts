import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDoc } from './messages.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDoc>,
  ) {}

  async save(from: string, to: string, text: string) {
    const m = new this.messageModel({ from, to, text });
    return m.save();
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
}
