import { type NextFunction, type Request, type Response } from 'express';
import { HEADER } from '../common/constant';
import { AppError, ErrorCode } from '../common/errors';
import { isValidTimeZone } from '../common/utils';
import { DeviceType, Lang } from '../enum/enum';

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const DEVICE_TYPES = new Set<number>([DeviceType.ANDROID, DeviceType.IOS, DeviceType.WEB]);
const LANGS = new Set<string>(Object.values(Lang));

export class HeaderValidator {
  static handle(req: Request, _res: Response, next: NextFunction): void {
    const deviceId = req.get(HEADER.DEVICE_ID)?.trim();
    if (!deviceId) throw new AppError(ErrorCode.DEVICE_ID_REQUIRED);
    if (!DEVICE_ID_PATTERN.test(deviceId)) throw new AppError(ErrorCode.INVALID_DEVICE_ID);

    const rawDeviceType = req.get(HEADER.DEVICE_TYPE)?.trim();
    if (!rawDeviceType) throw new AppError(ErrorCode.DEVICE_TYPE_REQUIRED);
    const deviceType = Number(rawDeviceType);
    if (!/^\d$/.test(rawDeviceType) || !DEVICE_TYPES.has(deviceType)) {
      throw new AppError(ErrorCode.INVALID_DEVICE_TYPE);
    }

    const timezone = req.get(HEADER.TIMEZONE)?.trim();
    if (!timezone) throw new AppError(ErrorCode.TIMEZONE_REQUIRED);
    if (timezone.length > 64 || !isValidTimeZone(timezone)) throw new AppError(ErrorCode.INVALID_TIMEZONE);

    const lang = req.get(HEADER.LANG)?.trim().toLowerCase();
    if (!lang) throw new AppError(ErrorCode.LANG_REQUIRED);
    if (!LANGS.has(lang)) throw new AppError(ErrorCode.INVALID_LANG);

    req.ctx = { deviceId, deviceType: deviceType as DeviceType, timezone, lang: lang as Lang };
    next();
  }
}

export const headerValidator = HeaderValidator.handle;
