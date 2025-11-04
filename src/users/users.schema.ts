import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDoc = User &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_]+$/,
  })
  username: string;

  @Prop({ required: true, minlength: 6 })
  passwordHash: string;

  @Prop({
    trim: true,
    match: /^https?:\/\/.+/,
  })
  avatar?: string;

  @Prop({ default: false })
  online: boolean;

  @Prop({ default: Date.now })
  lastSeen: Date;

  @Prop()
  accessToken?: string;

  @Prop()
  refreshToken?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
