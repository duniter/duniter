export function dos2unix(str:string) {
  return str.replace(/\r\n/g, '\n')
}
