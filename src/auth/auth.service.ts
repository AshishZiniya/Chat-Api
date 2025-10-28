import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async login(username: string, password: string) {
    type LeanUser = {
      _id: unknown;
      username: unknown;
      passwordHash?: unknown;
      avatar?: unknown;
    } | null;

    const user = (await this.usersService.findByUsername(username)) as LeanUser;

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Validate passwordHash exists and is a string
    if (typeof user.passwordHash !== 'string') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const bcrypt = await import('bcryptjs');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // Safely stringify _id: prefer calling toString() if present, otherwise
    // fall back to String(). This avoids using Object's default toString on
    // plain objects.
    let idString: string;
    if (
      user._id !== null &&
      typeof user._id === 'object' &&
      typeof (user._id as { toString?: unknown }).toString === 'function'
    ) {
      // toString exists, call it and coerce to string
      idString = String((user._id as { toString: () => unknown }).toString());
    } else {
      idString = String(user._id);
    }

    // Validate username is a string before including it in the token
    const usernameStr = typeof user.username === 'string' ? user.username : '';

    const token = jwt.sign(
      { sub: idString, username: usernameStr },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '7d' },
    );

    return {
      accessToken: token,
      user: { _id: idString, username: usernameStr, avatar: user.avatar },
    };
  }
  async register(username: string, password: string, avatar?: string) {
    // Validate input
    if (!username || !password) {
      throw new BadRequestException('Username and password are required');
    }
    if (username.length < 3) {
      throw new BadRequestException(
        'Username must be at least 3 characters long',
      );
    }
    if (password.length < 6) {
      throw new BadRequestException(
        'Password must be at least 6 characters long',
      );
    }
    // Check if user exists
    const existing = await this.usersService.findByUsername(username);
    if (existing) {
      throw new BadRequestException('Username already taken');
    }
    // Create user
    const user = await this.usersService.create(username, password, avatar);
    // Safely stringify _id
    let idString: string;
    if (
      user._id !== null &&
      typeof user._id === 'object' &&
      typeof (user._id as { toString?: unknown }).toString === 'function'
    ) {
      idString = String((user._id as { toString: () => unknown }).toString());
    } else {
      idString = String(user._id);
    }
    const token = jwt.sign(
      { sub: idString, username: user.username },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '7d' },
    );
    return {
      accessToken: token,
      user: { _id: idString, username: user.username, avatar: user.avatar },
    };
  }
}
