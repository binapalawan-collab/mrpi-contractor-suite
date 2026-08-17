import { describe,expect,it } from 'vitest'
import { attendanceUnits,calculateDailyWage,localDateISO } from './workforce'

describe('workforce helpers',()=>{
  it('maps attendance to payable units',()=>{expect(attendanceUnits('present')).toBe(1);expect(attendanceUnits('half_day')).toBe(.5);expect(attendanceUnits('absent')).toBe(0)})
  it('calculates daily wage and overtime',()=>expect(calculateDailyWage('half_day',100,2,15)).toBe(80))
  it('formats a local date without UTC drift',()=>expect(localDateISO(new Date(2026,7,17,23,30))).toBe('2026-08-17'))
})
