// Mock for Cocos Creator 'cc' module in Jest environment
export const Component = class {};
export const Node = class {
  children: any[] = [];
  active: boolean = true;
  getComponent = jest.fn();
  addComponent = jest.fn();
};
export const Label = class { string: string = ''; };
export const Button = class { interactable: boolean = true; };
export const tween = jest.fn().mockReturnValue({
  to: jest.fn().mockReturnThis(),
  call: jest.fn().mockReturnThis(),
  start: jest.fn().mockReturnThis(),
  then: jest.fn().mockResolvedValue(undefined),
});
export const Vec3 = class { constructor(public x=0, public y=0, public z=0) {} };
export const color = jest.fn();
export const _decorator = {
  ccclass: () => (target: any) => target,
  property: () => (target: any, key: string) => {},
};
export const director = {
  loadScene: jest.fn(),
};
export const sys = {
  copyTextToClipboard: jest.fn(),
};
export const Sprite = class { spriteFrame: any = null; };
export const Animation = class {
  play = jest.fn();
  stop = jest.fn();
  on = jest.fn();
};
export const Prefab = class {};
export const instantiate = jest.fn().mockReturnValue(new Node());
export const find = jest.fn().mockReturnValue(null);
export const UITransform = class {
  setContentSize = jest.fn();
  contentSize = { width: 0, height: 0 };
};
