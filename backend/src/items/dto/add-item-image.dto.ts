import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { Transform } from "class-transformer";

export class AddItemImageDto {
    @IsString()
    @IsNotEmpty()
    url: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Transform(({ value }) =>
        value === null || value === undefined || value === "" ? undefined : Number(value)
    )
    order?: number;
}