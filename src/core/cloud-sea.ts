import { IRequestCtx, ICloudSeaOptions, IAnyObject, IRequestOptions, IMethod, ICloudSeaConfig } from '../types';
import { RequestError } from './requestError';
import { defaultConfig } from './default';
import { Plugins } from './plugins';
import { Task } from './task';

export class CloudSea<U extends ICloudSeaConfig = ICloudSeaConfig> {
  public static readonly config: ICloudSeaConfig = { ...defaultConfig };

  public setConfig = (config: Partial<ICloudSeaConfig>) => {
    Object.assign(CloudSea.config, config);
  };

  private options: ICloudSeaOptions<Partial<U>>;
  public res: Plugins<IRequestCtx<U>>;
  public req: Plugins<IRequestCtx<U>>;
  public taskRequesting: Record<string, Task<IRequestCtx<U>>> = {};

  public completeHandler?(ctx: IRequestCtx<U>, err?: RequestError): void;
  public thenHandler?(ctx: IRequestCtx<U>): IAnyObject;
  public catchHandler?(err: RequestError, ctx: IRequestCtx<U>): void | RequestError;

  public constructor(options?: ICloudSeaOptions<Partial<U>>) {
    this.initOptions(options);
    this.initPlugins();
  }

  public initOptions(options?: ICloudSeaOptions<Partial<U>>) {
    this.options = options || {};
  }

  private initPlugins() {
    this.req = new Plugins<IRequestCtx<U>>();
    this.res = new Plugins<IRequestCtx<U>>();
  }

  public request<T>(data: IRequestOptions<Partial<U>>): Promise<T> {
    const { config } = CloudSea;
    const { ext: optionsExt, ...optionsReq } = this.options;
    const { ext: dataExt, task: dataTask, ...dataReq } = data;

    const ext = { ...config, ...optionsExt, ...dataExt };

    const header = this.reqHeaderHandler(ext.xRequestId);

    const newData = {
      req: { header, ...optionsReq, ...dataReq },
      ext,
      task: dataTask || {},
    } as Omit<IRequestCtx<U>, 'res'>;

    const requestTask = new Task<IRequestCtx<U>>(newData);

    if (dataTask?.name) {
      this.taskRequesting[dataTask.name] = requestTask;
    }

    this.req.pipe(requestTask.ctx);

    return requestTask
      .dispatch()
      .then((res) => {
        this.taskComplete(requestTask.ctx);
        this.res.pipe(requestTask.ctx);
        return (this.thenHandler?.(requestTask.ctx) || res) as T;
      })
      .catch((err: RequestError) => {
        this.taskComplete(requestTask.ctx, err);
        const error = this.catchHandler?.(err, requestTask.ctx);
        return Promise.reject(error || err);
      });
  }

  public method<T>(method: IMethod, data: IRequestOptions<Partial<U>>) {
    return this.request<T>({ ...data, method });
  }

  public get<T>(data: IRequestOptions<Partial<U>>) {
    return this.method<T>('GET', data);
  }

  public post<T>(data: IRequestOptions<Partial<U>>) {
    return this.method<T>('POST', data);
  }

  public abort(taskName?: string) {
    // abort 单个
    if (taskName) {
      this.taskRequesting[taskName]?.abort();
      return;
    }

    // abort 所有
    Object.keys(this.taskRequesting).forEach((item) => {
      this.taskRequesting[item].abort();
    });
  }

  protected taskComplete(ctx: IRequestCtx<U>, err?: RequestError) {
    const { name } = ctx.task;
    if (name && this.taskRequesting[name]) {
      delete this.taskRequesting[name];
    }

    this.completeHandler?.(ctx, err);
  }

  protected reqHeaderHandler(xRequestId: boolean) {
    const header = {};

    // request-id
    if (xRequestId) {
      Object.assign(header, { 'X-Request-Id': this.getUUID() });
    }

    // 自定义请求发起时间
    Object.assign(header, { 'X-Request-Time': Date.now() });

    return header;
  }

  protected getUUID(bytes = 16) {
    const SHARED_CHAR_CODES_ARRAY = Array(32);
    for (let i = 0; i < bytes * 2; i++) {
      SHARED_CHAR_CODES_ARRAY[i] = Math.floor(Math.random() * 16) + 48;
      // valid hex characters in the range 48-57 and 97-102
      if (SHARED_CHAR_CODES_ARRAY[i] >= 58) {
        SHARED_CHAR_CODES_ARRAY[i] += 39;
      }
    }
    return String.fromCharCode.apply(null, SHARED_CHAR_CODES_ARRAY.slice(0, bytes * 2));
  }
}
