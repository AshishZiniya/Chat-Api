import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDoc = User & Document;

@Schema()
export class User {
  @Prop({ required: true, unique: true }) username: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop() avatar?: string;
  @Prop({ default: false }) online?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
