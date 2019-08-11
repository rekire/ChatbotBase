// Just as required for ChatbotBase
declare module "fs" {
    function readdirSync(path: string): string[];
    function existsSync(path: string): boolean;
}