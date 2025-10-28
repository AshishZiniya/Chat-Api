import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDoc } from './users.schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDoc>) {}

  async create(username: string, password: string, avatar?: string) {
    const hash = await bcrypt.hash(password, 10);
    const u = new this.userModel({ username, passwordHash: hash, avatar });
    return u.save();
  }

  findByUsername(username: string) {
    return this.userModel.findOne({ username }).lean();
  }

  findById(id: string) {
    return this.userModel.findById(id).lean();
  }

  async validateUser(username: string, pass: string) {
    const user = await this.userModel.findOne({ username });
    if (!user) return null;
    const ok = await bcrypt.compare(pass, user.passwordHash);
    if (!ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = user.toObject();
    return rest;
  }

  setOnline(userId: string, online: boolean) {
    return this.userModel
      .updateOne({ _id: userId }, { $set: { online } })
      .exec();
  }

  listAll() {
    return this.userModel.find().lean();
  }
}
