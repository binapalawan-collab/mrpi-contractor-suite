import { describe,expect,it } from 'vitest'
import { attendanceUnits,calculateDailyWage,localDateISO,outstandingAttendanceWage,previousDateISO } from './workforce'

describe('workforce helpers',()=>{
  it('maps attendance to payable units',()=>{expect(attendanceUnits('present')).toBe(1);expect(attendanceUnits('half_day')).toBe(.5);expect(attendanceUnits('absent')).toBe(0)})
  it('calculates daily wage and overtime',()=>expect(calculateDailyWage('half_day',100,2,15)).toBe(80))
  it('keeps only the unpaid part of an attendance wage',()=>{expect(outstandingAttendanceWage(100,40)).toBe(60);expect(outstandingAttendanceWage(100,120)).toBe(0)})
  it('formats a local date without UTC drift',()=>expect(localDateISO(new Date(2026,7,17,23,30))).toBe('2026-08-17'))
  it('finds the previous calendar date across month boundaries',()=>expect(previousDateISO('2026-08-01')).toBe('2026-07-31'))
})
