export interface Substation{
    id: number;
    name: string;
    lat: number;
    lng: number;
    type: "wind" | "solar" | "hydro" | "thermal" | "urban";

}

