import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDoc = Message &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

export enum MessageType {
  TEXT = 'text',
  EMOJI = 'emoji',
  GIF = 'gif',
  STICKER = 'sticker',
  FILE = 'file',
  LOCATION = 'location',
  WEBVIEW = 'webview',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  from: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  to: Types.ObjectId;

  @Prop({ required: true, enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Prop({ trim: true })
  text?: string;

  // File-related properties
  @Prop()
  fileUrl?: string;

  @Prop()
  fileName?: string;

  @Prop({ min: 0 })
  fileSize?: number;

  @Prop()
  fileType?: string;

  // Location properties
  @Prop({ min: -90, max: 90 })
  latitude?: number;

  @Prop({ min: -180, max: 180 })
  longitude?: number;

  @Prop({ default: false })
  isLive?: boolean;

  // Web view properties
  @Prop()
  webUrl?: string;

  @Prop()
  webTitle?: string;

  @Prop()
  webDescription?: string;

  @Prop()
  webImageUrl?: string;

  // Status properties
  @Prop({ default: false })
  delivered: boolean;

  @Prop({ default: false })
  seen: boolean;

  // Soft delete
  @Prop({ type: [Types.ObjectId], default: [], ref: 'User' })
  deletedBy: Types.ObjectId[];

  // Reply functionality
  @Prop({ type: Types.ObjectId, ref: 'Message' })
  replyId?: Types.ObjectId;

  @Prop()
  replyText?: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
