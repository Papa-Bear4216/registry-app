export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Tabs: undefined;
  AddItem: {
    prefill?: {
      name: string;
      kind: string;
      taskCategory: string | null;
      description: string | null;
    };
    resolveStagingItemId?: string;
  } | undefined;
  ItemDetail: { itemId: string };
};

export type RootTabParamList = {
  Home: undefined;
  Registry: undefined;
  Staging: undefined;
  Tasks: undefined;
  Alerts: undefined;
};
