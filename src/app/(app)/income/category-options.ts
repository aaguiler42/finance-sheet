/** One flattened category, as the income forms need it. */
export interface CategoryOption {
  id: string;
  name: string;
  groupName: string;
  /** False for an archived category, or one inside an archived group. */
  selectable: boolean;
}
