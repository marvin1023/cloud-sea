export class Plugins<U> {
  private handlers: Array<(arg: U) => U>;

  public constructor() {
    this.handlers = [];
  }

  public use(fn: (arg: U) => U) {
    this.handlers.push(fn);
  }
  public pipe(x: U): U {
    if (this.handlers.length === 0) {
      return x;
    }

    return this.handlers.reduce((prev, cur) => cur(prev), x);
  }
}
