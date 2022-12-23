import { IRequestCtx, IAnyObject, ICloudSeaConfig } from '../types';
import { RequestError } from './requestError';
import { REQUEST_ERROR_MAP, DEFAULT_RETCODE_KEY } from './const';

export class Task<X extends IRequestCtx<ICloudSeaConfig>> {
  public ctx: X;

  public constructor(options: Omit<X, 'res'>) {
    this.init(options);
  }

  private init(options: Omit<X, 'res'>) {
    this.initCtx(options);
  }

  private initCtx(opts: Omit<X, 'res'>) {
    const { ext, req, task } = opts;

    // 构造 ctx 对象
    this.ctx = {
      req,
      res: {},
      ext,
      task,
    } as unknown as X;
  }

  public dispatch(): Promise<X> {
    const { ctx } = this;
    const { timeout } = ctx.ext;

    // 处理 url
    this.urlHandler();

    // 重试逻辑处理
    const repeatTry = (): Promise<X> => {
      // 超时 abort 处理
      if (timeout) {
        ctx.task.timer = setTimeout(() => {
          ctx.task.client?.abort();
          clearTimeout(ctx.task.timer);
        }, timeout);
      }

      return this.promiseAdapter()
        .then((result) => {
          const { statusCode } = result;
          if (statusCode >= 200 && statusCode < 300) {
            this.clearHandler();
            // 挂到 ctx.res 上
            this.ctx.res = result;

            // retcode 处理
            this.retcodeHandler();

            const logicErrMsg = this.retcodeWhiteListHandler();

            if (logicErrMsg) {
              throw new RequestError(logicErrMsg, {
                type: REQUEST_ERROR_MAP.logic,
                retcode: this.ctx.res.data.retcode,
              });
            }

            return this.ctx;
          }

          // 处理服务器错误 message
          throw new RequestError('Server Error', { type: REQUEST_ERROR_MAP.server, statusCode });
        })
        .catch((err) => {
          // 非逻辑错误，执行清空操作及重试
          if (!(err.type && err.type === REQUEST_ERROR_MAP.logic)) {
            this.clearHandler();

            // 重试
            if (this.ctx.ext.repeatNum && this.ctx.ext.repeatNum--) {
              return repeatTry();
            }
          }

          const newError = err.type
            ? err
            : new RequestError(err.message || err.errMsg, { type: REQUEST_ERROR_MAP.fail });

          throw newError;
        });
    };

    this.ctx.task.repeatTry = repeatTry;

    return repeatTry();
  }

  public abort() {
    this.ctx.task.client?.abort();
  }

  protected promiseAdapter(): Promise<any> {
    const { req, ext } = this.ctx;
    const { adapter } = ext;

    if (!adapter) {
      return Promise.reject('adapter is must be required');
    }

    return new Promise((resolve, reject) => {
      this.ctx.task.client = adapter(req, resolve, reject);
    });
  }

  protected clearHandler() {
    const { ctx } = this;
    const { timeout } = ctx.ext;
    const { timer } = ctx.task;

    // 计算请求耗时
    ctx.task.costTime = Date.now() - ctx.req.header['X-Request-Time'];

    // 清除计时
    if (timeout && timer) {
      clearTimeout(timer);
    }
  }

  protected retcodeHandler() {
    const { ctx } = this;
    const { retcodeKey } = ctx.ext;
    if (!retcodeKey) {
      return;
    }
    // 如果key值为非 retcode 的 string，则手动添加 retcode 等于该 key 的值
    if (typeof retcodeKey === 'string' && retcodeKey !== DEFAULT_RETCODE_KEY) {
      ctx.res.data[DEFAULT_RETCODE_KEY] = ctx.res.data[retcodeKey];
      return;
    }

    // 如果 key 值为数组，如['retcode', 'code', 'ret_code', 'ret'];
    if (Array.isArray(retcodeKey)) {
      const len = retcodeKey.length;

      for (let i = 0; i < len; i++) {
        const item = ctx.res.data[retcodeKey[i]];
        if (item !== undefined) {
          ctx.res.data[DEFAULT_RETCODE_KEY] = item;
          break;
        }
      }
    }
  }

  protected retcodeWhiteListHandler() {
    const { ctx } = this;
    const {
      ext: { retcodeKey, retcodeWhiteList },
      res,
    } = ctx;

    // 关闭白名单，retcode 不论为啥都为成功
    // 或者没有 retcodeKey
    if (!retcodeWhiteList || !retcodeKey) {
      return;
    }

    // 如果为 0 或者在白名单内，则进入 then 处理
    const retArr = retcodeWhiteList;
    const { retcode } = res.data || {};
    const isWhite = retArr.includes(retcode);
    if (retcode === 0 || isWhite) {
      return;
    }

    // 逻辑错误
    return this.getLogicErrMsg();
  }

  protected getLogicErrMsg(): string {
    const { ctx } = this;
    const { res, ext } = ctx;
    const { logicErrorMsgKey, logicErrorMsgUnknown } = ext;

    // 如果没有指定 msg 的 key
    if (!logicErrorMsgKey) {
      return logicErrorMsgUnknown;
    }

    // 如果有指定，则取该值
    let logicErrMsg: string | undefined = res.data?.[logicErrorMsgKey];
    // 错误信息可能不是一个直接的 string 字段，而是被包裹在一个对象中，如 errData: { text: 'xxx', code: xxx };
    // 这样可以设置 key 值为 'errData.text'，分割得到最终的字段
    if (!logicErrMsg && logicErrorMsgKey.includes('.')) {
      const [key1, key2] = logicErrorMsgKey.split('.');
      if (res.data?.[key1]?.[key2]) {
        logicErrMsg = res.data[key1][key2];
      }
    }

    return logicErrMsg || logicErrorMsgUnknown;
  }

  protected urlHandler() {
    const { ctx } = this;
    const {
      ext: { baseUrl },
      req: { url },
    } = ctx;
    if (baseUrl && !url.startsWith('http')) {
      ctx.req.url = `${baseUrl}${url}`;
    }

    ctx.task.urlHasNoSearch = ctx.req.url.split('?')[0]; // 不带 query 的 url，可用于统计或上报等
  }
}
