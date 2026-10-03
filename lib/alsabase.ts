import AlsaBase from "alsabase";

const ALSABASE_URL = process.env.NEXT_PUBLIC_ALSABASE_URL || "";

export const ab = new AlsaBase(ALSABASE_URL);

export default ab;
