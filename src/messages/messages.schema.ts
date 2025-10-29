import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDoc = Message &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true }) from: string;
  @Prop({ required: true }) to: string;
  @Prop({ default: 'text' }) type: string; // 'text', 'emoji', 'gif', 'sticker', 'file', 'location', 'webview'
  @Prop() text?: string; // For text, emoji, gif, sticker (URL or code)
  @Prop() fileUrl?: string;
  @Prop() fileName?: string;
  @Prop() fileSize?: number;
  @Prop() fileType?: string;
  @Prop() latitude?: number;
  @Prop() longitude?: number;
  @Prop({ default: false }) isLive?: boolean;
  @Prop() webUrl?: string;
  @Prop() webTitle?: string;
  @Prop() webDescription?: string;
  @Prop() webImageUrl?: string;
  @Prop({ default: false }) delivered: boolean;
  @Prop({ default: false }) seen: boolean;
  @Prop({ type: [String], default: [] }) deletedBy: string[];
  @Prop() _id: string; // ID of message being replied to
  @Prop() replyText?: string; // Preview text of replied message
}

export const MessageSchema = SchemaFactory.createForClass(Message);
