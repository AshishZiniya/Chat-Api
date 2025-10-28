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
  @Prop({ required: true }) text: string;
  @Prop({ default: false }) delivered: boolean;
  @Prop({ default: false }) seen: boolean;
  @Prop({ type: [String], default: [] }) deletedBy: string[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
