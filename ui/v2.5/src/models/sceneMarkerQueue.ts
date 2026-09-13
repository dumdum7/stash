import { FilterMode } from "src/core/generated-graphql";
import { ListFilterModel } from "./list-filter/filter";

export class SceneMarkerQueue {
  public query?: ListFilterModel;

  public static fromListFilterModel(filter: ListFilterModel) {
    const ret = new SceneMarkerQueue();
    ret.query = filter.clone();
    ret.query.itemsPerPage = 40;
    return ret;
  }

  public static fromQueryParameters(params: URLSearchParams) {
    const ret = new SceneMarkerQueue();
    if (!params.has("mqfp")) return ret;

    const decoded = ListFilterModel.decodeParams({
      sortby: params.get("mqsort"),
      sortdir: params.get("mqsortd"),
      q: params.get("mqfq"),
      p: params.get("mqfp"),
      c: params.getAll("mqfc"),
    });
    ret.query = new ListFilterModel(FilterMode.SceneMarkers);
    ret.query.configureFromDecodedParams(decoded);
    return ret;
  }

  public makeLink(
    marker: { id: string; seconds: number; scene: { id: string } },
    options: { autoPlay?: boolean; continue?: boolean; page?: number } = {}
  ) {
    if (!this.query) return `/scenes/${marker.scene.id}?t=${marker.seconds}`;
    const encoded = this.query.getEncodedParams();
    const params = [
      `mqfp=${options.page ?? encoded.p ?? "1"}`,
      ...(encoded.sortby ? [`mqsort=${encoded.sortby}`] : []),
      ...(encoded.sortdir ? [`mqsortd=${encoded.sortdir}`] : []),
      ...(encoded.q ? [`mqfq=${encoded.q}`] : []),
      ...(encoded.c ?? []).map((criterion) => `mqfc=${criterion}`),
      `qm=${marker.id}`,
      `t=${marker.seconds}`,
    ];
    if (options.autoPlay) params.push("autoplay=true");
    if (options.continue !== undefined)
      params.push(`continue=${options.continue}`);
    return `/scenes/${marker.scene.id}?${params.join("&")}`;
  }
}
